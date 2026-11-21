import { describe, it, expect } from 'vitest';
import {
  createLocalDemoSyncTransport,
  createMemoryDraftStorage,
  createOfflineDraftQueue,
  makeVisitIdempotencyKey,
  type OfflineDraft,
} from './draftQueue';
import type { VisitRecord } from '../domain/types';

const sampleVisit: VisitRecord = {
  id: 'VIS-1001',
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
  transcript: 'ANC visit weight 55 kg',
  dangerSign: false,
  needsReview: false,
  corrections: [],
};

describe('offline draft queue, idempotency, and pluggable SyncTransport', () => {
  it('enqueues pending drafts, prevents duplicate submissions via idempotencyKey, and survives queue reload', async () => {
    const sharedStorage = createMemoryDraftStorage();
    const queueBeforeReload = createOfflineDraftQueue(sharedStorage);
    const key = makeVisitIdempotencyKey(sampleVisit);

    const first = await queueBeforeReload.enqueue(sampleVisit, key);
    const dup = await queueBeforeReload.enqueue(sampleVisit, key);
    expect(first.duplicate).toBe(false);
    expect(first.draft.state).toBe('pending');
    expect(dup.duplicate).toBe(true);

    // Simulate reload with a fresh queue instance attached to the same persistent store
    const queueAfterReload = createOfflineDraftQueue(sharedStorage);
    const listed = await queueAfterReload.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].idempotencyKey).toBe(key);
    expect(listed[0].state).toBe('pending');
  });

  it('transitions pending -> syncing -> failed when offline/error and retries to synced cleanly', async () => {
    const storage = createMemoryDraftStorage();
    const queue = createOfflineDraftQueue(storage);
    const statesObserved: string[] = [];

    const { draft } = await queue.enqueue(sampleVisit);

    let online = false;
    const transport = createLocalDemoSyncTransport({ checkOnline: () => online });

    // Attempt sync while offline -> fails cleanly with error
    const afterOffline = await queue.syncAll(transport, (list) => {
      if (list[0]) statesObserved.push(list[0].state);
    });
    expect(afterOffline[0].state).toBe('failed');
    expect(afterOffline[0].attempts).toBe(1);
    expect(afterOffline[0].lastError).toMatch(/offline/i);
    expect(statesObserved).toEqual(['syncing', 'failed']);

    // Reconnect and retry -> transitions to synced with remoteId
    online = true;
    const retried = await queue.syncOne(draft.idempotencyKey, transport);
    expect(retried?.state).toBe('synced');
    expect(retried?.attempts).toBe(2);
    expect(retried?.remoteId).toBe('SYNC-VIS-1001');

    // Re-running syncAll must not duplicate or re-submit already-synced drafts
    let calls = 0;
    const countingTransport = {
      name: 'SpyTransport',
      async submitVisit(d: OfflineDraft) {
        calls += 1;
        return { ok: true as const, remoteId: `REMOTE-${d.visit.id}` };
      },
    };
    await queue.syncAll(countingTransport);
    expect(calls).toBe(0);
  });
});
