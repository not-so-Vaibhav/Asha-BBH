import type { VisitRecord, VisitType } from './types';

/**
 * Finds an existing visit of the same visit type for the same beneficiary on the same calendar day (YYYY-MM-DD).
 */
export function findSameDayDuplicateVisit(
  visits: VisitRecord[],
  beneficiaryId: string,
  visitType: VisitType,
  dayIso: string,
): VisitRecord | undefined {
  return visits.find(
    (v) =>
      v.beneficiaryId === beneficiaryId &&
      v.fields.visitType === visitType &&
      v.timestamp.slice(0, 10) === dayIso,
  );
}
