import { describe, it, expect } from 'vitest';
import { findSameDayDuplicateVisit } from './duplicateCheck';
import type { VisitRecord } from './types';

const visits: VisitRecord[] = [
  {
    id: 'VIS-1',
    beneficiaryId: 'BEN-1001',
    beneficiaryName: 'Sunita Patil',
    fields: { beneficiaryId: 'BEN-1001', visitType: 'ANC', weight: '55 kg', vaccinationsDue: 'None reported', nextVisitDate: '2026-11-20' },
    timestamp: '2026-11-13T09:15:00.000Z',
    transcript: 'ANC visit',
    dangerSign: false,
    needsReview: false,
    corrections: [],
  },
];

describe('same-day duplicate visit detection', () => {
  it('flags a second visit of the same type for the same beneficiary on the same day', () => {
    expect(findSameDayDuplicateVisit(visits, 'BEN-1001', 'ANC', '2026-11-13')?.id).toBe('VIS-1');
  });

  it('does not flag different visit types, different beneficiaries, or different days', () => {
    expect(findSameDayDuplicateVisit(visits, 'BEN-1001', 'PNC', '2026-11-13')).toBeUndefined();
    expect(findSameDayDuplicateVisit(visits, 'BEN-1002', 'ANC', '2026-11-13')).toBeUndefined();
    expect(findSameDayDuplicateVisit(visits, 'BEN-1001', 'ANC', '2026-11-14')).toBeUndefined();
  });
});
