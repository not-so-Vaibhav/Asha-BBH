# Danger-Rule Candidate Variants for Native Speaker Review (`pending_review`)

Gnani Prisma v3.0 with `format=codemix` frequently returns **Devanagari-transliterated English** clinical terms (for example `ब्लीडिंग`, `फीवर`, `ब्रीदिंग`) when Hindi or Marathi speakers mix English terms into regional speech.

**Governance rule:** None of the unreviewed variants listed below are enabled in active Hindi/Marathi alert matching yet. They are recorded under `pending_review` in [`src/domain/rules.ts`](../src/domain/rules.ts) and should only be promoted into active `patterns` after a native Hindi and Marathi speaker signs off on clinical accuracy and false-positive risk.

---

## Pregnancy Danger Rules (`BeneficiaryKind = Pregnant`)

### `PREG-01` — Bleeding during pregnancy
Already active (reviewed in Phase 1/2): `ब्लीडिंग`, `रक्तस्राव`, `खून आना`, `खून आ रहा`, `खून बह रहा`, `रक्त जाणे`, `रक्त जात आहे`.

| Status | Lang | Candidate variant | Roman / source | Review notes / FP risk |
|---|---|---|---|---|
| [ ] `pending_review` | hi | `वजाइनल ब्लीडिंग` | vaginal bleeding | Low FP risk; already covered if `ब्लीडिंग` present |
| [ ] `pending_review` | hi | `स्पॉटिंग` | spotting | Moderate FP risk if used outside obstetric context |
| [ ] `pending_review` | hi | `ब्लड आ रहा` | blood coming | Low FP risk on pregnant beneficiary |
| [ ] `pending_review` | mr | `व्हजायनल ब्लीडिंग` | vaginal bleeding | Low FP risk |
| [ ] `pending_review` | mr | `स्पॉटिंग` | spotting | Moderate FP risk; verify with Marathi ASHA wording |
| [ ] `pending_review` | mr | `ब्लड येत आहे` | blood coming | Low FP risk on pregnant beneficiary |

### `PREG-02` — High fever during pregnancy
Already active: `तेज बुखार`, `बहुत तेज बुखार`, `ज्यादा बुखार`, `जास्त ताप`, `खूप ताप`, `तीव्र ताप`.

| Status | Lang | Candidate variant | Roman / source | Review notes / FP risk |
|---|---|---|---|---|
| [ ] `pending_review` | hi | `हाई फीवर` | high fever | Low FP risk; confirm spelling (`हाई` vs `हाय`) |
| [ ] `pending_review` | hi | `हाय फीवर` | high fever | Common Prisma transliteration |
| [ ] `pending_review` | hi | `बहुत फीवर` | very high fever | Low FP risk |
| [ ] `pending_review` | hi | `हाई टेम्परेचर` | high temperature | Low FP risk |
| [ ] `pending_review` | mr | `हाय फिव्हर` | high fever | Common Marathi transliteration |
| [ ] `pending_review` | mr | `हाय फीवर` | high fever | Variant without half-va |
| [ ] `pending_review` | mr | `जास्त फिव्हर` | high fever | Marathi/English code-mix |
| [ ] `pending_review` | mr | `हाय टेम्परेचर` | high temperature | Low FP risk |

---

## Newborn Danger Rules (`BeneficiaryKind = Newborn`)

### `NB-01` — Fever or hot to touch
Already active: `बुखार`, `छूने पर गर्म`, `शरीर गर्म`, `बदन गर्म`, `ताप`, `अंग गरम`, `शरीर गरम`.

| Status | Lang | Candidate variant | Roman / source | Review notes / FP risk |
|---|---|---|---|---|
| [ ] `pending_review` | hi | `फीवर` | fever | Low FP risk on Newborn; check negation (`फीवर नहीं`) |
| [ ] `pending_review` | hi | `फिवर` | fever | Short-vowel Prisma variant |
| [ ] `pending_review` | hi | `हॉट टू टच` | hot to touch | Low FP risk |
| [ ] `pending_review` | hi | `बॉडी हॉट` | body hot | Low FP risk |
| [ ] `pending_review` | mr | `फिव्हर` | fever | Standard Marathi transliteration |
| [ ] `pending_review` | mr | `फीवर` | fever | Alternate Prisma transliteration |
| [ ] `pending_review` | mr | `हॉट टू टच` | hot to touch | Low FP risk |
| [ ] `pending_review` | mr | `बॉडी हॉट` | body hot | Low FP risk |

### `NB-02` — Cold to touch
Already active: `ठंडा`, `छूने पर ठंडा`, `शरीर ठंडा`, `बदन ठंडा`, `थंड`, `अंग थंड`, `शरीर थंड`.

| Status | Lang | Candidate variant | Roman / source | Review notes / FP risk |
|---|---|---|---|---|
| [ ] `pending_review` | hi | `कोल्ड टू टच` | cold to touch | Avoid bare `कोल्ड` (could mean common cold/cough) |
| [ ] `pending_review` | hi | `बॉडी कोल्ड` | body cold | Low FP risk |
| [ ] `pending_review` | hi | `हाइपोथर्मिया` | hypothermia | Clinical term; low FP risk |
| [ ] `pending_review` | mr | `कोल्ड टू टच` | cold to touch | Low FP risk |
| [ ] `pending_review` | mr | `बॉडी कोल्ड` | body cold | Low FP risk |
| [ ] `pending_review` | mr | `हायपोथर्मिया` | hypothermia | Clinical term; low FP risk |

### `NB-03` — Not feeding
Already active: `दूध नहीं पी`, `दूध नहीं पी रहा`, `दूध नहीं पी रही`, `स्तनपान नहीं`, `दूध पीत नाही`, `दूध घेत नाही`, `दूध पित नाही`.

| Status | Lang | Candidate variant | Roman / source | Review notes / FP risk |
|---|---|---|---|---|
| [ ] `pending_review` | hi | `नॉट फीडिंग` | not feeding | Low FP risk |
| [ ] `pending_review` | hi | `फीडिंग नहीं` | not feeding | Check negation context carefully |
| [ ] `pending_review` | hi | `मिल्क नहीं पी रहा` | not drinking milk | Low FP risk |
| [ ] `pending_review` | mr | `नॉट फीडिंग` | not feeding | Low FP risk |
| [ ] `pending_review` | mr | `फीडिंग नाही` | not feeding | Check negation context carefully |
| [ ] `pending_review` | mr | `मिल्क पीत नाही` | not drinking milk | Low FP risk |

### `NB-04` — Fast or difficult breathing
Already active: `तेज सांस`, `सांस लेने में कठिनाई`, `सांस लेने में तकलीफ`, `सांस फूल`, `जलद श्वास`, `श्वास घ्यायला त्रास`, `श्वास घेण्यास त्रास`, `दम लागणे`.

| Status | Lang | Candidate variant | Roman / source | Review notes / FP risk |
|---|---|---|---|---|
| [ ] `pending_review` | hi | `फास्ट ब्रीदिंग` | fast breathing | Low FP risk |
| [ ] `pending_review` | hi | `डिफिकल्ट ब्रीदिंग` | difficult breathing | Low FP risk |
| [ ] `pending_review` | hi | `ब्रीदिंग प्रॉब्लम` | breathing problem | Low FP risk |
| [ ] `pending_review` | hi | `चेस्ट इनड्रॉइंग` | chest indrawing | MoHFW HBNC danger sign |
| [ ] `pending_review` | mr | `फास्ट ब्रीदिंग` | fast breathing | Low FP risk |
| [ ] `pending_review` | mr | `डिफिकल्ट ब्रीदिंग` | difficult breathing | Low FP risk |
| [ ] `pending_review` | mr | `ब्रीदिंग त्रास` | breathing trouble | Marathi/English code-mix |
| [ ] `pending_review` | mr | `चेस्ट इनड्रॉइंग` | chest indrawing | MoHFW HBNC danger sign |

### `NB-05` — Other newborn danger sign
Already active: `कमजोर रोना`, `सुस्त`, `दौरे`, `झटके`, `पीली हथेलियां`, `पीले तलवे`, `कमकुवत रडणे`, `निस्तेज`, `आकडी`, `पिवळे तळहात`, `पिवळे तळवे`.

| Status | Lang | Candidate variant | Roman / source | Review notes / FP risk |
|---|---|---|---|---|
| [ ] `pending_review` | hi | `वीक क्राय` | weak cry | Low FP risk |
| [ ] `pending_review` | hi | `लिंप` | limp | Check phonetically similar words before enabling |
| [ ] `pending_review` | hi | `लेथार्जिक` | lethargic | Low FP risk |
| [ ] `pending_review` | hi | `कन्वल्शन` | convulsion | Low FP risk |
| [ ] `pending_review` | hi | `फिट्स` | fits | Low FP risk on Newborn |
| [ ] `pending_review` | hi | `सीजर` | seizure | Moderate FP risk (sounds like C-section "सीज़र"); review carefully |
| [ ] `pending_review` | hi | `येलो पाम्स` | yellow palms | Low FP risk |
| [ ] `pending_review` | hi | `येलो सोल्स` | yellow soles | Low FP risk |
| [ ] `pending_review` | mr | `वीक क्राय` | weak cry | Low FP risk |
| [ ] `pending_review` | mr | `लिंप` | limp | Check phonetically similar words before enabling |
| [ ] `pending_review` | mr | `लेथार्जिक` | lethargic | Low FP risk |
| [ ] `pending_review` | mr | `कन्व्हल्शन्स` | convulsions | Low FP risk |
| [ ] `pending_review` | mr | `फिट्स` | fits | Low FP risk on Newborn |
| [ ] `pending_review` | mr | `सीझर` | seizure | Moderate FP risk (sounds like C-section "सीझर"); review carefully |
| [ ] `pending_review` | mr | `येलो पाम्स` | yellow palms | Low FP risk |
| [ ] `pending_review` | mr | `येलो सोल्स` | yellow soles | Low FP risk |
