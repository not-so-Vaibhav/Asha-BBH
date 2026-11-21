-- ASHA SAKHI Idempotent Seed Data (Synthetic Demo Geography & MoHFW Danger-Sign Rules)
-- Safe to run repeatedly (`supabase db reset` or manual re-seed).

insert into public.areas (code, name, district, block, synthetic)
values
  ('AREA-DEMO-A', 'Demo Block A · Pipalwadi', 'Sample District A', 'Demo Block A', true),
  ('AREA-DEMO-B', 'Demo Block A · Lotuswadi', 'Sample District B', 'Demo Block A', true),
  ('AREA-DEMO-C', 'Demo Block B · Riverbend', 'Sample District C', 'Demo Block B', true)
on conflict (code) do update set
  name = excluded.name,
  district = excluded.district,
  block = excluded.block;

insert into public.villages (code, area_id, name, block, district, center_lat, center_lng, boundary_json, synthetic)
values
  (
    'village-pipal',
    (select id from public.areas where code = 'AREA-DEMO-A'),
    'Pipalwadi',
    'Demo Block A',
    'Sample District A',
    21.150,
    79.080,
    '[[21.155,79.071],[21.157,79.086],[21.148,79.092],[21.144,79.079]]'::jsonb,
    true
  ),
  (
    'village-lotus',
    (select id from public.areas where code = 'AREA-DEMO-B'),
    'Lotuswadi',
    'Demo Block A',
    'Sample District B',
    21.164,
    79.094,
    '[[21.169,79.087],[21.172,79.099],[21.160,79.104],[21.157,79.091]]'::jsonb,
    true
  ),
  (
    'village-river',
    (select id from public.areas where code = 'AREA-DEMO-C'),
    'Riverbend',
    'Demo Block B',
    'Sample District C',
    21.137,
    79.103,
    '[[21.143,79.096],[21.145,79.107],[21.133,79.111],[21.131,79.099]]'::jsonb,
    true
  )
on conflict (code) do update set
  area_id = excluded.area_id,
  name = excluded.name,
  block = excluded.block,
  district = excluded.district,
  center_lat = excluded.center_lat,
  center_lng = excluded.center_lng,
  boundary_json = excluded.boundary_json;

insert into public.health_facilities (code, area_id, name, sample_label, lat, lng, distance_label, synthetic)
values
  ('FAC-PHC-A', (select id from public.areas where code = 'AREA-DEMO-A'), 'Sample PHC North', 'Sample facility', 21.155, 79.105, '1.8 km', true),
  ('FAC-PHC-B', (select id from public.areas where code = 'AREA-DEMO-B'), 'Sample PHC East', 'Sample facility', 21.168, 79.110, '2.1 km', true),
  ('FAC-PHC-C', (select id from public.areas where code = 'AREA-DEMO-C'), 'Sample PHC South', 'Sample facility', 21.132, 79.112, '2.4 km', true)
on conflict (code) do update set
  area_id = excluded.area_id,
  name = excluded.name,
  sample_label = excluded.sample_label,
  lat = excluded.lat,
  lng = excluded.lng,
  distance_label = excluded.distance_label;

insert into public.danger_sign_rules (id, version, category, applies_to, source_citation, wording_en, wording_hi, wording_mr, active)
values
  (
    'PREG-01',
    'PS1-demo-3',
    'Bleeding during pregnancy',
    array['pregnant']::public.beneficiary_kind[],
    'Predefined danger sign · MoHFW guideline',
    'A predefined danger sign was reported. Referral support is recommended.',
    'एक पूर्वनिर्धारित खतरे का संकेत बताया गया है। रेफ़रल सहायता लें।',
    'पूर्वनिर्धारित धोक्याचे लक्षण नोंदले आहे. रेफरल सहाय्य घ्या.',
    true
  ),
  (
    'PREG-02',
    'PS1-demo-3',
    'High fever during pregnancy',
    array['pregnant']::public.beneficiary_kind[],
    'Predefined danger sign · MoHFW guideline',
    'A predefined danger sign was reported. Referral support is recommended.',
    'एक पूर्वनिर्धारित खतरे का संकेत बताया गया है। रेफ़रल सहायता लें।',
    'पूर्वनिर्धारित धोक्याचे लक्षण नोंदले आहे. रेफरल सहाय्य घ्या.',
    true
  ),
  (
    'NB-01',
    'PS1-demo-3',
    'Fever or hot to touch',
    array['newborn']::public.beneficiary_kind[],
    'Predefined danger sign · MoHFW guideline',
    'A predefined danger sign was reported. Referral support is recommended.',
    'एक पूर्वनिर्धारित खतरे का संकेत बताया गया है। रेफ़रल सहायता लें।',
    'पूर्वनिर्धारित धोक्याचे लक्षण नोंदले आहे. रेफरल सहाय्य घ्या.',
    true
  ),
  (
    'NB-02',
    'PS1-demo-3',
    'Cold to touch',
    array['newborn']::public.beneficiary_kind[],
    'Predefined danger sign · MoHFW guideline',
    'A predefined danger sign was reported. Referral support is recommended.',
    'एक पूर्वनिर्धारित खतरे का संकेत बताया गया है। रेफ़रल सहायता लें।',
    'पूर्वनिर्धारित धोक्याचे लक्षण नोंदले आहे. रेफरल सहाय्य घ्या.',
    true
  ),
  (
    'NB-03',
    'PS1-demo-3',
    'Not feeding',
    array['newborn']::public.beneficiary_kind[],
    'Predefined danger sign · MoHFW guideline',
    'A predefined danger sign was reported. Referral support is recommended.',
    'एक पूर्वनिर्धारित खतरे का संकेत बताया गया है। रेफ़रल सहायता लें।',
    'पूर्वनिर्धारित धोक्याचे लक्षण नोंदले आहे. रेफरल सहाय्य घ्या.',
    true
  ),
  (
    'NB-04',
    'PS1-demo-3',
    'Fast or difficult breathing',
    array['newborn']::public.beneficiary_kind[],
    'Predefined danger sign · MoHFW guideline',
    'A predefined danger sign was reported. Referral support is recommended.',
    'एक पूर्वनिर्धारित खतरे का संकेत बताया गया है। रेफ़रल सहायता लें।',
    'पूर्वनिर्धारित धोक्याचे लक्षण नोंदले आहे. रेफरल सहाय्य घ्या.',
    true
  ),
  (
    'NB-05',
    'PS1-demo-3',
    'Other newborn danger sign',
    array['newborn']::public.beneficiary_kind[],
    'Predefined danger sign · MoHFW guideline',
    'A predefined danger sign was reported. Referral support is recommended.',
    'एक पूर्वनिर्धारित खतरे का संकेत बताया गया है। रेफ़रल सहायता लें।',
    'पूर्वनिर्धारित धोक्याचे लक्षण नोंदले आहे. रेफरल सहाय्य घ्या.',
    true
  )
on conflict (id) do update set
  version = excluded.version,
  category = excluded.category,
  applies_to = excluded.applies_to,
  source_citation = excluded.source_citation,
  wording_en = excluded.wording_en,
  wording_hi = excluded.wording_hi,
  wording_mr = excluded.wording_mr,
  active = excluded.active;
