import type { VisitRecord } from '../domain/types';

export type DraftQueueState = 'pending' | 'syncing' | 'synced' | 'failed';

export type OfflineDraft = {
  idempotencyKey: string;
  visit: VisitRecord;
  state: DraftQueueState;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  remoteId?: string;
  lastError?: string;
};

/**
 * Sync transport abstraction so Phase 4 can plug in a real HTTP/REST backend API
 * without changing IndexedDB queue management, UI states, or idempotency handling.
 */
export interface SyncTransport {
  readonly name: string;
  submitVisit(draft: OfflineDraft): Promise<{ ok: true; remoteId: string } | { ok: false; error: string }>;
}

export interface DraftStorage {
  getAll(): Promise<OfflineDraft[]>;
  get(idempotencyKey: string): Promise<OfflineDraft | undefined>;
  put(draft: OfflineDraft): Promise<void>;
  delete(idempotencyKey: string): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'asha-sakhi-offline-v1';
const DB_VERSION = 1;
const STORE_NAME = 'visit_drafts';

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'idempotencyKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

export function createIndexedDbStorage(): DraftStorage {
  return {
    async getAll() {
      const db = await openDraftDb();
      return new Promise<OfflineDraft[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
          const items = (req.result as OfflineDraft[]) || [];
          items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          resolve(items);
        };
        req.onerror = () => reject(req.error ?? new Error('Failed to read drafts'));
      });
    },
    async get(idempotencyKey) {
      const db = await openDraftDb();
      return new Promise<OfflineDraft | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(idempotencyKey);
        req.onsuccess = () => resolve(req.result as OfflineDraft | undefined);
        req.onerror = () => reject(req.error ?? new Error('Failed to read draft'));
      });
    },
    async put(draft) {
      const db = await openDraftDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(draft);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to save draft'));
      });
    },
    async delete(idempotencyKey) {
      const db = await openDraftDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(idempotencyKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to delete draft'));
      });
    },
    async clear() {
      const db = await openDraftDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to clear drafts'));
      });
    },
  };
}

export function createMemoryDraftStorage(): DraftStorage {
  const map = new Map<string, OfflineDraft>();
  return {
    async getAll() {
      return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async get(key) {
      return map.get(key);
    },
    async put(draft) {
      map.set(draft.idempotencyKey, { ...draft });
    },
    async delete(key) {
      map.delete(key);
    },
    async clear() {
      map.clear();
    },
  };
}

export function makeVisitIdempotencyKey(visit: Pick<VisitRecord, 'id' | 'beneficiaryId' | 'timestamp' | 'fields'>): string {
  const day = visit.timestamp.slice(0, 10);
  return `idem:${visit.id}:${visit.beneficiaryId}:${visit.fields.visitType}:${day}`;
}

/**
 * Local Phase 3 demo sync transport behind the SyncTransport interface.
 * Enforces idempotency across repeated calls for the same key and fails cleanly when offline.
 * Phase 4 replaces this with an authenticated HTTP API implementation of SyncTransport.
 */
export function createLocalDemoSyncTransport(
  options: { checkOnline?: () => boolean; shouldFail?: (draft: OfflineDraft) => string | null } = {},
): SyncTransport {
  const submitted = new Map<string, string>();
  const isOnline = options.checkOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));

  return {
    name: 'LocalDemoSyncTransport (Phase 2 local sync)',
    async submitVisit(draft) {
      if (!isOnline()) {
        return { ok: false, error: 'Device is offline' };
      }
      const injectedErr = options.shouldFail?.(draft);
      if (injectedErr) {
        return { ok: false, error: injectedErr };
      }
      // Idempotent deduplication: repeated submission returns the original remoteId
      const existing = submitted.get(draft.idempotencyKey);
      if (existing) {
        return { ok: true, remoteId: existing };
      }
      const remoteId = `SYNC-${draft.visit.id}`;
      submitted.set(draft.idempotencyKey, remoteId);
      return { ok: true, remoteId };
    },
  };
}

export function createOfflineDraftQueue(storage?: DraftStorage) {
  const store: DraftStorage =
    storage ?? (typeof indexedDB !== 'undefined' ? createIndexedDbStorage() : createMemoryDraftStorage());

  async function list(): Promise<OfflineDraft[]> {
    return store.getAll();
  }

  /** Enqueues a visit draft keyed by idempotencyKey; duplicate enqueueing never creates a second entry. */
  async function enqueue(visit: VisitRecord, explicitKey?: string): Promise<{ draft: OfflineDraft; duplicate: boolean }> {
    const idempotencyKey = explicitKey || visit.idempotencyKey || makeVisitIdempotencyKey(visit);
    const existing = await store.get(idempotencyKey);
    if (existing) {
      return { draft: existing, duplicate: true };
    }
    const now = new Date().toISOString();
    const draft: OfflineDraft = {
      idempotencyKey,
      visit: { ...visit, idempotencyKey },
      state: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    await store.put(draft);
    return { draft, duplicate: false };
  }

  async function syncOne(
    idempotencyKey: string,
    transport: SyncTransport,
    onChange?: (drafts: OfflineDraft[]) => void,
  ): Promise<OfflineDraft | null> {
    const current = await store.get(idempotencyKey);
    if (!current || current.state === 'synced') return current ?? null;

    const syncing: OfflineDraft = {
      ...current,
      state: 'syncing',
      attempts: current.attempts + 1,
      updatedAt: new Date().toISOString(),
      lastError: undefined,
    };
    await store.put(syncing);
    if (onChange) onChange(await store.getAll());

    try {
      const result = await transport.submitVisit(syncing);
      const next: OfflineDraft = result.ok
        ? { ...syncing, state: 'synced', remoteId: result.remoteId, updatedAt: new Date().toISOString(), lastError: undefined }
        : { ...syncing, state: 'failed', lastError: result.error, updatedAt: new Date().toISOString() };
      await store.put(next);
      if (onChange) onChange(await store.getAll());
      return next;
    } catch (err) {
      const next: OfflineDraft = {
        ...syncing,
        state: 'failed',
        lastError: err instanceof Error ? err.message : 'Sync failed',
        updatedAt: new Date().toISOString(),
      };
      await store.put(next);
      if (onChange) onChange(await store.getAll());
      return next;
    }
  }

  async function syncAll(
    transport: SyncTransport,
    onChange?: (drafts: OfflineDraft[]) => void,
  ): Promise<OfflineDraft[]> {
    const all = await store.getAll();
    const candidates = all.filter((d) => d.state === 'pending' || d.state === 'failed');
    for (const draft of candidates) {
      await syncOne(draft.idempotencyKey, transport, onChange);
    }
    return store.getAll();
  }

  async function clear(): Promise<void> {
    await store.clear();
  }

  return { list, enqueue, syncOne, syncAll, clear };
}

export const defaultDraftQueue = createOfflineDraftQueue();
export const defaultSyncTransport = createLocalDemoSyncTransport();
