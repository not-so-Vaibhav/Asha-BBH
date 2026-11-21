import { describe, it, expect, vi } from 'vitest';
import { ALERT_VIBRATION_PATTERN, triggerAlertVibration } from './alertFeedback';
import { followUpStatusForDate } from '../store/useAppStore';

describe('alert vibration feature check', () => {
  it('returns unsupported when Vibration API is missing', () => {
    expect(triggerAlertVibration({})).toEqual({ supported: false, triggered: false });
    expect(triggerAlertVibration(undefined)).toEqual({ supported: false, triggered: false });
  });

  it('triggers pattern and reports triggered=true when supported', () => {
    const vibrate = vi.fn(() => true);
    expect(triggerAlertVibration({ vibrate })).toEqual({ supported: true, triggered: true });
    expect(vibrate).toHaveBeenCalledWith(ALERT_VIBRATION_PATTERN);
  });

  it('reports triggered=false when browser declines vibration', () => {
    const vibrate = vi.fn(() => false);
    expect(triggerAlertVibration({ vibrate })).toEqual({ supported: true, triggered: false });
  });

  it('handles vibrate throwing gracefully', () => {
    const vibrate = vi.fn(() => { throw new Error('blocked'); });
    expect(triggerAlertVibration({ vibrate })).toEqual({ supported: false, triggered: false });
  });
});

describe('follow-up status categorization', () => {
  it('classifies dates into Overdue, Pending (today), and Upcoming', () => {
    expect(followUpStatusForDate('2026-11-10', '2026-11-13')).toBe('Overdue');
    expect(followUpStatusForDate('2026-11-13', '2026-11-13')).toBe('Pending');
    expect(followUpStatusForDate('2026-11-20', '2026-11-13')).toBe('Upcoming');
  });
});
