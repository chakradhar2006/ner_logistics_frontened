// Dexie.js wrapper around IndexedDB for offline-first incident storage.
//
// Why IndexedDB (via Dexie) instead of localStorage:
//  - localStorage has a ~5-10MB total quota and is synchronous, so stashing
//    base64-encoded incident photos in it quickly hits the limit and blocks
//    the main thread.
//  - IndexedDB can store binary Blobs directly (no base64 bloat, ~33% smaller
//    on disk) and has a much larger, browser-managed quota, which is what an
//    offline field-photo queue actually needs.
//
// Dexie just gives IndexedDB a friendly Promise-based API on top of the
// native, callback-heavy IndexedDB API.

import Dexie from 'dexie';

export const db = new Dexie('nerOfflineDb');

db.version(1).stores({
  // 'id' is the primary key (we generate it ourselves so items can be
  // referenced before they've ever touched the network). 'status' is
  // indexed so we can quickly count pending/failed items.
  incidents: 'id, status, queuedAt',
});

export default db;
