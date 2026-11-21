import { describe, it, expect } from 'vitest';
import {
  FOLLOWUPS_CSV_HEADERS,
  REFERRALS_CSV_HEADERS,
  UTF8_BOM,
  VISITS_CSV_HEADERS,
  escapeCsvCell,
  followupsToCsv,
  referralsToCsv,
  visitsToCsv,
} from './csvExport';
import type { FollowUp, Referral, VisitRecord } from './types';

describe('CSV export (UTF-8 BOM, headers, Devanagari, RFC-4180, zero hidden fields)', () => {
  const visits: VisitRecord[] = [
    {
      id: 'VIS-1',
      beneficiaryId: 'BEN-1001',
      beneficiaryName: 'Sunita Patil',
      fields: {
        beneficiaryId: 'BEN-1001',
        visitType: 'ANC',
        weight: '55 kg',
        vaccinationsDue: 'TT1',
        nextVisitDate: '2026-11-20',
      },
      timestamp: '2026-11-13T10:00:00.000Z',
      transcript: 'सुनीता पाटील, वजन 55 किलो, "पुढील भेट" 20 नोव्हेंबर',
      dangerSign: false,
      needsReview: false,
      corrections: [{ field: 'weight', oldValue: '54 kg', newValue: '55 kg', timestamp: '2026-11-13T10:01:00.000Z' }],
      idempotencyKey: 'idem:secret-internal-key',
      duplicateOverrideReason: 'Follow-up re-check',
    },
  ];

  const followups: FollowUp[] = [
    { id: 'FU-1', beneficiaryId: 'BEN-1001', beneficiaryName: 'Sunita Patil', date: '2026-11-14', status: 'Upcoming', visitId: 'VIS-1' },
  ];

  const referrals: Referral[] = [
    {
      id: 'REF-1',
      beneficiaryId: 'BEN-1001',
      ruleId: 'PREG-01',
      category: 'Bleeding during pregnancy',
      source: 'manual',
      facility: 'Sample PHC North',
      status: 'Pending review',
      needsReview: false,
      timestamp: '2026-11-13T10:02:00.000Z',
      visitId: 'VIS-1',
      transcriptExcerpt: 'गर्भवती को खून आ रहा है',
    },
  ];

  it('prepends UTF-8 BOM and exports exact headers and Devanagari text for visits without internal keys', () => {
    const csv = visitsToCsv(visits);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe(VISITS_CSV_HEADERS.join(','));
    expect(lines[1]).toContain('सुनीता पाटील');
    expect(lines[1]).toContain('""पुढील भेट""');
    expect(lines[1]).toContain('Follow-up re-check');
    expect(lines[1]).toContain('Synthetic demo data');
    expect(csv).not.toContain('idem:secret-internal-key');
  });

  it('exports follow-ups and referrals with UTF-8 BOM, correct headers, and source field', () => {
    const fuCsv = followupsToCsv(followups);
    expect(fuCsv.startsWith(UTF8_BOM)).toBe(true);
    expect(fuCsv.slice(1).split('\r\n')[0]).toBe(FOLLOWUPS_CSV_HEADERS.join(','));
    expect(fuCsv).toContain('2026-11-14');

    const refCsv = referralsToCsv(referrals);
    expect(refCsv.startsWith(UTF8_BOM)).toBe(true);
    expect(refCsv.slice(1).split('\r\n')[0]).toBe(REFERRALS_CSV_HEADERS.join(','));
    expect(refCsv).toContain(',manual,');
    expect(refCsv).toContain('गर्भवती को खून आ रहा है');
  });

  it('neutralizes CSV spreadsheet formula injection and handles empty arrays cleanly', () => {
    expect(escapeCsvCell('=CMD()')).toBe("'=CMD()");
    expect(escapeCsvCell('+1+2')).toBe("'+1+2");
    const emptyCsv = visitsToCsv([]);
    expect(emptyCsv).toBe(`${UTF8_BOM}${VISITS_CSV_HEADERS.join(',')}\r\n`);
  });
});
