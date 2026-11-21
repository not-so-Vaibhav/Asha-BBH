import { ArrowLeft, MapPin, X } from 'lucide-react';
import { copy, extraCopy } from '../data/i18n';
import { demoDistricts, facility, villages } from '../data/geo';
import type { Beneficiary, Language, Referral, VisitRecord } from '../domain/types';
import MapView, { VillageCoverage } from '../components/MapView';

const demoBlocks = [...new Set(villages.map((v) => v.block))];

type Props = {
  language: Language;
  visits: VisitRecord[];
  referrals: Referral[];
  district: string;
  block: string;
  villageId: string;
  coverage: number;
  highlightFacility: boolean;
  onBack: () => void;
  onSelectDistrict: (d: string) => void;
  onSelectBlock: (b: string) => void;
  onSelectVillage: (v: string) => void;
  onSelectHousehold: (b: Beneficiary) => void;
  onCloseFacility: () => void;
  onBackToDraft: () => void;
};

export default function MapScreen({
  language,
  visits,
  referrals,
  district,
  block,
  villageId,
  coverage,
  highlightFacility,
  onBack,
  onSelectDistrict,
  onSelectBlock,
  onSelectVillage,
  onSelectHousehold,
  onCloseFacility,
  onBackToDraft,
}: Props) {
  const t = copy[language];
  const x = extraCopy[language];

  return (
    <>
      <div className="page-title">
        <button type="button" className="icon" aria-label={x.back} onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <h1>{t.map}</h1>
      </div>
      <div className="map-top-note">
        {t.geoDisclaimer}
        <br />
        {t.privacy}
      </div>
      {highlightFacility && (
        <div className="facility-highlight">
          <MapPin aria-hidden="true" />
          <div>
            <b>{facility.name}</b>
            <small>
              {t.sampleFacility} · {facility.distance}
            </small>
          </div>
          <button type="button" onClick={onCloseFacility} aria-label={x.closeFacility}>
            <X size={18} aria-hidden="true" />
          </button>
          <button type="button" className="back-draft-map" onClick={onBackToDraft}>
            {t.backDraft}
          </button>
        </div>
      )}
      <div className="geo-chips">
        <label>
          {t.district}
          <select aria-label={t.district} value={district} onChange={(e) => onSelectDistrict(e.target.value)}>
            {demoDistricts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.block}
          <select aria-label={t.block} value={block} onChange={(e) => onSelectBlock(e.target.value)}>
            {demoBlocks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.village}
          <select aria-label={t.village} value={villageId} onChange={(e) => onSelectVillage(e.target.value)}>
            {villages.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <MapView
        visits={visits}
        referrals={referrals}
        language={language}
        district={district}
        selectedVillage={villageId}
        onSelectVillage={onSelectVillage}
        onSelectHousehold={onSelectHousehold}
        highlightFacility={highlightFacility}
      />
      <div className="coverage-heading">
        <h2>{t.coverageStats}</h2>
        <span>
          {coverage}% {t.completed}
        </span>
      </div>
      <VillageCoverage visits={visits} language={language} />
      <div className="map-disclaimer">
        <p>{t.geoDisclaimer}</p>
        <span>{t.privacy}</span>
      </div>
    </>
  );
}
