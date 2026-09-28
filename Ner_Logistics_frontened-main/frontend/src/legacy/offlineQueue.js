// A real offline-first queue for incident reports, backed by IndexedDB
// (via Dexie).
//
// If POSTing an incident fails because the device is offline (or the
// request errors out for a network reason), the incident — including its
// photo, stored as a raw Blob — is written to IndexedDB instead of being
// silently dropped. It stays "pending" until connectivity returns, at
// which point flushOfflineQueue() replays every queued item against the
// real API and removes it from the queue on success.
//
// Photos are kept as Blobs (not base64 strings) so they don't bloat ~33%
// in size and so we're not fighting localStorage's small, synchronous
// quota — IndexedDB is built for exactly this kind of binary, offline data.

import { db } from './db.js';

function makeId() {
  return `local-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

// Queues one incident report locally. Returns the queued item's id.
export async function queueOfflineIncident(fields, photoFile) {
  const item = {
    id: makeId(),
    fields,
    photo: photoFile
      ? { blob: photoFile, name: photoFile.name, type: photoFile.type }
      : null,
    queuedAt: new Date().toISOString(),
    status: 'pending',
    lastError: null,
  };
  await db.incidents.put(item);
  window.dispatchEvent(new CustomEvent('ner:offline-queue-changed'));
  return item.id;
}

// Returns every queued item (pending + failed), oldest first.
export async function listOfflineQueue() {
  try {
    return await db.incidents.orderBy('queuedAt').toArray();
  } catch (err) {
    console.warn('Could not read offline queue:', err.message);
    return [];
  }
}

export async function offlineQueueCounts() {
  const queue = await listOfflineQueue();
  return {
    pendingReports: queue.filter((q) => q.status === 'pending' || q.status === 'failed').length,
    pendingPhotos: queue.filter((q) => q.photo && (q.status === 'pending' || q.status === 'failed')).length,
  };
}

export async function removeFromOfflineQueue(id) {
  await db.incidents.delete(id);
  window.dispatchEvent(new CustomEvent('ner:offline-queue-changed'));
}

// Attempts to submit every pending/failed queued item against the real API.
// Successful items are removed; failed ones stay queued with the latest error.
export async function flushOfflineQueue(incidentApiCreate) {
  const queue = await listOfflineQueue();
  if (!queue.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const photoFile = item.photo
        ? new File([item.photo.blob], item.photo.name || 'photo.jpg', { type: item.photo.type || 'image/jpeg' })
        : null;
      await incidentApiCreate(item.fields, photoFile);
      await db.incidents.delete(item.id);
      synced++;
    } catch (err) {
      failed++;
      await db.incidents.put({ ...item, status: 'failed', lastError: err.message || 'Sync failed' });
    }
  }

  window.dispatchEvent(new CustomEvent('ner:offline-queue-changed'));
  return { synced, failed };
}
