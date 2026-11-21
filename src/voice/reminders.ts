import type { FollowUp, Language } from '../domain/types';

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getTomorrowsFollowUps(followups: FollowUp[], referenceDate: string, extraToday?: string): FollowUp[] {
  const targets = new Set<string>([addDaysIso(referenceDate, 1)]);
  if (extraToday) targets.add(addDaysIso(extraToday, 1));
  return followups.filter((f) => f.status !== 'Done' && targets.has(f.date));
}

export function buildTomorrowReminderText(items: FollowUp[], language: Language): string {
  if (items.length === 0) {
    if (language === 'hi') return 'कल कोई फ़ॉलो-अप निर्धारित नहीं है।';
    if (language === 'mr') return 'उद्या कोणतीही पुढील भेट नाही.';
    return 'No follow-ups scheduled for tomorrow.';
  }
  const names = items.map((f) => f.beneficiaryName).join(', ');
  if (language === 'hi') {
    return `कल के रिमाइंडर: ${items.length} फ़ॉलो-अप। ${names}।`;
  }
  if (language === 'mr') {
    return `उद्याची आठवण: ${items.length} पुढील भेटी. ${names}.`;
  }
  const unit = items.length === 1 ? 'follow-up' : 'follow-ups';
  return `Tomorrow’s reminders: ${items.length} ${unit}. ${names}.`;
}
