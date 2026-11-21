import type { FollowUp, Referral, VisitRecord } from './types';

export const UTF8_BOM = '\uFEFF';
const DATA_LABEL = 'Synthetic demo data';

/** RFC-4180 CSV cell escaping with formula-injection protection for spreadsheet safety. */
export function escapeCsvCell(value: unknown): string {
  let str = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return UTF8_BOM + lines.join('\r\n') + '\r\n';
}

export const VISITS_CSV_HEADERS = [
  'Visit ID',
  'Beneficiary ID',
  'Beneficiary Name',
  'Visit Type',
  'Weight',
  'Vaccinations Due',
  'Next Visit Date',
  'Timestamp',
  'Danger Sign',
  'Needs Review',
  'Referral ID',
  'Corrections Count',
  'Duplicate Override Reason',
  'Transcript',
  'Data Label',
];

export const FOLLOWUPS_CSV_HEADERS = [
  'Follow-up ID',
  'Beneficiary ID',
  'Beneficiary Name',
  'Due Date',
  'Status',
  'Visit ID',
  'Data Label',
];

export const REFERRALS_CSV_HEADERS = [
  'Referral ID',
  'Beneficiary ID',
  'Rule ID',
  'Category',
  'Source',
  'Facility',
  'Status',
  'Needs Review',
  'Timestamp',
  'Visit ID',
  'Transcript Excerpt',
  'Data Label',
];

export function visitsToCsv(visits: VisitRecord[]): string {
  return buildCsv(
    VISITS_CSV_HEADERS,
    visits.map((v) => [
      v.id,
      v.beneficiaryId,
      v.beneficiaryName,
      v.fields.visitType,
      v.fields.weight,
      v.fields.vaccinationsDue,
      v.fields.nextVisitDate,
      v.timestamp,
      v.dangerSign ? 'Yes' : 'No',
      v.needsReview ? 'Yes' : 'No',
      v.referralId ?? '',
      v.corrections.length,
      v.duplicateOverrideReason ?? '',
      v.transcript,
      DATA_LABEL,
    ]),
  );
}

export function followupsToCsv(followups: FollowUp[]): string {
  return buildCsv(
    FOLLOWUPS_CSV_HEADERS,
    followups.map((f) => [
      f.id,
      f.beneficiaryId,
      f.beneficiaryName,
      f.date,
      f.status,
      f.visitId,
      DATA_LABEL,
    ]),
  );
}

export function referralsToCsv(referrals: Referral[]): string {
  return buildCsv(
    REFERRALS_CSV_HEADERS,
    referrals.map((r) => [
      r.id,
      r.beneficiaryId,
      r.ruleId,
      r.category,
      r.source ?? 'asr',
      r.facility,
      r.status,
      r.needsReview ? 'Yes' : 'No',
      r.timestamp,
      r.visitId ?? '',
      r.transcriptExcerpt,
      DATA_LABEL,
    ]),
  );
}

export function triggerCsvDownload(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
