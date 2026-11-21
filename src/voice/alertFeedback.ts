export type VibrationResult = {
  supported: boolean;
  triggered: boolean;
};

export const ALERT_VIBRATION_PATTERN = [180, 80, 180];

export function triggerAlertVibration(nav: { vibrate?: (pattern: number | number[]) => boolean } | undefined = typeof navigator !== 'undefined' ? navigator : undefined): VibrationResult {
  if (!nav || typeof nav.vibrate !== 'function') {
    return { supported: false, triggered: false };
  }
  try {
    const ok = nav.vibrate(ALERT_VIBRATION_PATTERN);
    return { supported: true, triggered: Boolean(ok) };
  } catch {
    return { supported: false, triggered: false };
  }
}
