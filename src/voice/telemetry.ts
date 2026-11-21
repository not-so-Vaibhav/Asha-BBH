export type SttConnectionState = 'idle' | 'connecting' | 'listening' | 'reconnecting' | 'error' | 'fallback';

export type VoiceTelemetry = {
  activeProvider: string;
  sttState: SttConnectionState;
  timeToFirstPartialMs: number | null;
  timeToFinalMs: number | null;
  timbreLatencyMs: number | null;
  timbreCached: boolean;
  reconnectCount: number;
  lastErrorCode: string | null;
};

const initialState: VoiceTelemetry = {
  activeProvider: 'Gnani Prisma v3.0',
  sttState: 'idle',
  timeToFirstPartialMs: null,
  timeToFinalMs: null,
  timbreLatencyMs: null,
  timbreCached: false,
  reconnectCount: 0,
  lastErrorCode: null,
};

let state: VoiceTelemetry = { ...initialState };
const listeners = new Set<() => void>();

export function getVoiceTelemetry(): VoiceTelemetry {
  return state;
}

export function updateVoiceTelemetry(patch: Partial<VoiceTelemetry>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function resetVoiceTelemetry(): void {
  state = { ...initialState };
  for (const listener of listeners) listener();
}

export function subscribeVoiceTelemetry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
