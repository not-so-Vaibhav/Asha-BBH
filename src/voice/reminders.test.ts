import { describe, it, expect } from 'vitest';
import { addDaysIso, buildTomorrowReminderText, getTomorrowsFollowUps } from './reminders';
import type { FollowUp } from '../domain/types';

describe('tomorrow voice reminders', () => {
  const followups: FollowUp[] = [
    { id: 'FU-1', beneficiaryId: 'BEN-1001', beneficiaryName: 'Sunita Patil', date: '2026-11-14', status: 'Upcoming', visitId: 'V1' },
    { id: 'FU-2', beneficiaryId: 'BEN-1003', beneficiaryName: 'Rekha Jadhav', date: '2026-11-14', status: 'Upcoming', visitId: 'V2' },
    { id: 'FU-3', beneficiaryId: 'BEN-1004', beneficiaryName: 'Meena Pawar', date: '2026-11-14', status: 'Done', visitId: 'V3' },
    { id: 'FU-4', beneficiaryId: 'BEN-1005', beneficiaryName: 'Aarav Kulkarni', date: '2026-11-20', status: 'Upcoming', visitId: 'V4' },
  ];

  it('selects only active follow-ups due tomorrow', () => {
    expect(addDaysIso('2026-11-13', 1)).toBe('2026-11-14');
    const due = getTomorrowsFollowUps(followups, '2026-11-13');
    expect(due.map((f) => f.id)).toEqual(['FU-1', 'FU-2']);
  });

  it('builds localized reminder text in en, hi, and mr for both populated and empty lists', () => {
    const due = getTomorrowsFollowUps(followups, '2026-11-13');
    expect(buildTomorrowReminderText(due, 'en')).toContain('2 follow-ups. Sunita Patil, Rekha Jadhav.');
    expect(buildTomorrowReminderText(due, 'hi')).toContain('कल के रिमाइंडर: 2 फ़ॉलो-अप। Sunita Patil, Rekha Jadhav।');
    expect(buildTomorrowReminderText(due, 'mr')).toContain('उद्याची आठवण: 2 पुढील भेटी. Sunita Patil, Rekha Jadhav.');

    expect(buildTomorrowReminderText([], 'en')).toBe('No follow-ups scheduled for tomorrow.');
    expect(buildTomorrowReminderText([], 'hi')).toBe('कल कोई फ़ॉलो-अप निर्धारित नहीं है।');
    expect(buildTomorrowReminderText([], 'mr')).toBe('उद्या कोणतीही पुढील भेट नाही.');
  });
});
