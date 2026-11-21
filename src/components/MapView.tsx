import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Beneficiary, Language, Referral, VisitRecord } from '../domain/types';
import { copy, extraCopy } from '../data/i18n';
import { facility, villages } from '../data/geo';
import { beneficiaries } from '../data/seed';

type Props = {
  visits: VisitRecord[];
  referrals: Referral[];
  district: string;
  selectedVillage: string;
  onSelectVillage: (id: string) => void;
  onSelectHousehold: (beneficiary: Beneficiary) => void;
  highlightFacility: boolean;
  language: Language;
};

function distinctVisitedCount(visits: VisitRecord[], ids: string[]): number {
  return new Set(visits.filter((v) => ids.includes(v.beneficiaryId)).map((v) => v.beneficiaryId)).size;
}

export default function MapView({
  visits,
  referrals,
  district,
  selectedVillage,
  onSelectVillage,
  onSelectHousehold,
  highlightFacility,
  language,
}: Props) {
  const t = copy[language];
  const x = extraCopy[language];
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [tileError, setTileError] = useState(false);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);

  useEffect(() => {
    if (!host.current || map.current) return;
    const instance = L.map(host.current, { zoomControl: false, attributionControl: true }).setView([21.151, 79.092], 13);
    map.current = instance;
    L.control.zoom({ position: 'bottomright' }).addTo(instance);
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors',
    });
    tiles.on('tileerror', () => setTileError(true));
    tiles.addTo(instance);
    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    instance.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) return;
      instance.removeLayer(layer);
    });
    for (const v of villages) {
      const active = v.district === district;
      const ids = v.households.map((h) => h.beneficiaryId);
      const completed = distinctVisitedCount(visits, ids);
      const pct = ids.length ? completed / ids.length : 0;
      const color = pct === 0 ? '#e8a949' : pct < 0.5 ? '#ee8a55' : '#0e9f8e';
      L.polygon(v.boundary, {
        color: active ? '#0b1f33' : '#92a09c',
        weight: active ? 2.5 : 1,
        opacity: active ? 1 : 0.55,
        fillColor: color,
        fillOpacity: active ? 0.3 : 0.12,
        dashArray: active ? undefined : '4 4',
      })
        .addTo(instance)
        .bindTooltip(v.name + ' · ' + Math.round(pct * 100) + '%');

      for (const h of v.households) {
        const person = beneficiaries.find((b) => b.id === h.beneficiaryId);
        if (!person) continue;
        const visited = visits.some((visit) => visit.beneficiaryId === person.id);
        const danger = referrals.some((r) => r.beneficiaryId === person.id);
        const stateClass = danger ? 'pin-danger' : visited ? 'pin-done' : 'pin-pending';
        const marker = L.circleMarker([h.lat, h.lng], {
          radius: danger ? 8 : 6,
          color: danger ? '#e5484d' : '#fff',
          weight: 2,
          fillColor: danger ? '#e5484d' : visited ? '#0e9f8e' : '#f5a623',
          fillOpacity: 1,
          className: `household-pin household-pin-${person.id} ${stateClass}`,
        }).addTo(instance);
        marker.on('click', () => {
          setSelectedHouseholdId(person.id);
          onSelectHousehold(person);
        });
        marker.bindTooltip(h.label);
      }
    }

    const phc = L.marker([facility.lat, facility.lng], {
      icon: L.divIcon({ className: 'phc-marker', html: '<span>+</span>', iconSize: [28, 28], iconAnchor: [14, 14] }),
    }).addTo(instance);
    phc.bindTooltip(t.sampleFacility + ' · ' + facility.distance, { permanent: true, direction: 'top' });

    if (highlightFacility) {
      instance.setView([facility.lat, facility.lng], 15, { animate: false });
    } else {
      const points = villages.flatMap((v) => v.boundary).map(([lat, lng]) => L.latLng(lat, lng));
      points.push(L.latLng(facility.lat, facility.lng));
      instance.fitBounds(L.latLngBounds(points), { padding: [18, 18], animate: false });
    }
  }, [district, highlightFacility, onSelectHousehold, referrals, t.sampleFacility, visits]);

  const pinPerson = selectedHouseholdId ? beneficiaries.find((b) => b.id === selectedHouseholdId) : null;
  const pinStatus = pinPerson
    ? referrals.some((r) => r.beneficiaryId === pinPerson.id)
      ? t.danger
      : visits.some((v) => v.beneficiaryId === pinPerson.id)
        ? x.visitCompleted
        : x.visitPending
    : '';

  const fallback = (
    <svg className="map-fallback" viewBox="0 0 360 250" role="img" aria-label={x.schematicMap}>
      <rect width="360" height="250" rx="18" fill="#e9f1ec" />
      <path d="M0 180 Q85 120 145 156 T360 112" fill="none" stroke="#b4d8db" strokeWidth="24" />
      <path d="M40 30 L130 25 145 98 60 118Z M210 35 L310 30 332 100 225 112Z M75 150 L162 140 190 218 93 232Z" fill="#cde5d8" stroke="#0b1f33" strokeWidth="2" />
      <text x="50" y="70">Pipalwadi</text>
      <text x="220" y="70">Lotuswadi</text>
      <text x="95" y="190">Riverbend</text>
    </svg>
  );

  return (
    <div className="map-wrap">
      {tileError && (
        <div className="map-fallback-wrap" aria-hidden="false">
          {fallback}
          <span>{x.tilesUnavailable}</span>
        </div>
      )}
      <div ref={host} className={tileError ? 'leaflet-map tiles-failed' : 'leaflet-map'} aria-label={t.geoDisclaimer} />
      {pinPerson && (
        <div className="pin-detail" role="status">
          <b>{pinPerson.name}</b>
          <span>{pinStatus}</span>
          <button onClick={() => setSelectedHouseholdId(null)} aria-label={x.closePin}>×</button>
        </div>
      )}
      <div className="map-key">
        <span><i className="done-dot" />{t.completed}</span>
        <span><i className="pending-dot" />{t.pending}</span>
        <span><i className="danger-dot" />{t.danger}</span>
      </div>
      <div className="village-select" aria-label={x.chooseVillage}>
        {villages.map((v) => (
          <button key={v.id} className={selectedVillage === v.id ? 'active' : ''} onClick={() => onSelectVillage(v.id)}>
            {v.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VillageCoverage({ visits, language }: { visits: VisitRecord[]; language: Language }) {
  const t = copy[language];
  const scores = villages.map((v) => {
    const ids = v.households.map((h) => h.beneficiaryId);
    const completed = distinctVisitedCount(visits, ids);
    return { v, percent: ids.length ? completed / ids.length : 0 };
  });
  const lowest = scores.reduce((a, b) => (a.percent <= b.percent ? a : b)).v.id;
  return (
    <div className="coverage-list">
      {villages.map((v) => {
        const ids = v.households.map((h) => h.beneficiaryId);
        const completed = distinctVisitedCount(visits, ids);
        const percent = ids.length ? Math.round((completed / ids.length) * 100) : 0;
        return (
          <div className="coverage-item" key={v.id}>
            <div>
              <b>{v.name}</b>
              {v.id === lowest && percent < 25 && <strong className="low-tag">{t.lowCoverage}</strong>}
              <small>
                {completed} {t.completed.toLowerCase()} · {Math.max(0, ids.length - completed)} {t.pending.toLowerCase()}
              </small>
            </div>
            <span className="coverage-meter">
              <i style={{ width: percent + '%' }} />
            </span>
            <b>{percent}%</b>
          </div>
        );
      })}
    </div>
  );
}
