import { GitHubAggregated, GitHubNotifications, GitHubNotification } from "../github-types";

// Represents a cached notification record stored in IndexedDB
interface CachedNotificationDB extends GitHubNotification {
  cachedAt: number;
  expiresAt: number;
}
type CachedNotificationRecord = CachedNotificationDB & { id: number | string };

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DB_VERSION = 2;
const NOTIFICATIONS_STORE = "notifications";
const AGGREGATED_STORE = "aggregatedNotifications";
const META_KEY = "meta";
interface CacheMetaRecord {
  id: typeof META_KEY;
  cachedAt: number;
  expiresAt: number;
}

// this file contains functions to save and retrieve issues/images from IndexedDB which is client-side in-browser storage
export async function saveImageToCache({
  dbName,
  storeName,
  keyName,
  orgName,
  avatarBlob,
}: {
  dbName: string;
  storeName: string;
  keyName: string;
  orgName: string;
  avatarBlob: Blob;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName, 2); // Increase version number to ensure onupgradeneeded is called
    open.onupgradeneeded = function () {
      const db = open.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: keyName });
      }
    };
    open.onsuccess = function () {
      const db = open.result;
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const item = {
        name: `avatarUrl-${orgName}`,
        image: avatarBlob,
        created: new Date().getTime(),
      };
      store.put(item);
      transaction.oncomplete = function () {
        db.close();
        resolve();
      };
      transaction.onerror = function (event) {
        const errorEventTarget = event.target as IDBRequest;
        reject("Error saving image to DB: " + errorEventTarget.error?.message);
      };
    };
  });
}

export function getImageFromCache({ dbName, storeName, orgName }: { dbName: string; storeName: string; orgName: string }): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName, 2); // Increase version number to ensure onupgradeneeded is called
    open.onupgradeneeded = function () {
      const db = open.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "name" });
      }
    };
    open.onsuccess = function () {
      const db = open.result;
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const getImage = store.get(`avatarUrl-${orgName}`);
      getImage.onsuccess = function () {
        resolve(getImage.result?.image || null);
      };
      transaction.oncomplete = function () {
        db.close();
      };
      transaction.onerror = function (event) {
        const errorEventTarget = event.target as IDBRequest;
        reject("Error retrieving image from DB: " + errorEventTarget.error?.message);
      };
    };
  });
}

async function openNotificationsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("NotificationsDB", DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(NOTIFICATIONS_STORE)) {
        db.createObjectStore(NOTIFICATIONS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(AGGREGATED_STORE)) {
        db.createObjectStore(AGGREGATED_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putMeta(store: IDBObjectStore, now: number) {
  const meta: CacheMetaRecord = { id: META_KEY, cachedAt: now, expiresAt: now + CACHE_TTL_MS };
  store.put(meta);
}

// Saves fetched notifications into IndexedDB with TTL (overwrites prior cache)
export async function saveNotificationsToCache(fetchedNotifications: GitHubNotifications): Promise<void> {
  const db = await openNotificationsDB();
  const transaction = db.transaction([NOTIFICATIONS_STORE], "readwrite");
  const store = transaction.objectStore(NOTIFICATIONS_STORE);

  const now = Date.now();
  store.clear();
  fetchedNotifications.forEach((notification) => {
    const item = {
      ...notification,
      cachedAt: now,
      expiresAt: now + CACHE_TTL_MS,
    };
    store.put(item);
  });
  putMeta(store, now);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => reject((event.target as IDBTransaction).error);
  });
}

// Saves aggregated notifications into IndexedDB with TTL (overwrites prior cache)
export async function saveAggregatedNotificationsToCache(aggregated: GitHubAggregated[]): Promise<void> {
  const db = await openNotificationsDB();
  const transaction = db.transaction([AGGREGATED_STORE], "readwrite");
  const store = transaction.objectStore(AGGREGATED_STORE);

  const now = Date.now();
  store.clear();
  aggregated.forEach((item) => {
    store.put({
      id: item.notification.id,
      ...item,
      cachedAt: now,
      expiresAt: now + CACHE_TTL_MS,
    });
  });
  putMeta(store, now);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => reject((event.target as IDBTransaction).error);
  });
}

function isNotExpired(expiresAt?: number, now: number = Date.now()): boolean {
  return typeof expiresAt === "number" ? expiresAt > now : true;
}

function filterValid<T extends { expiresAt?: number; id: number | string }>(items: T[]): T[] {
  const now = Date.now();
  return items.filter((item) => item.id !== META_KEY && isNotExpired(item.expiresAt, now));
}

// Retrieves notifications from IndexedDB, filtering out expired ones
export async function getNotificationsFromCache(): Promise<GitHubNotifications> {
  const db = await openNotificationsDB();
  const transaction = db.transaction([NOTIFICATIONS_STORE], "readonly");
  const store = transaction.objectStore(NOTIFICATIONS_STORE);

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const results = (request.result as unknown as CachedNotificationRecord[]) || [];
      resolve(filterValid(results) as unknown as GitHubNotifications);
    };
    request.onerror = () => reject(request.error);
  });
}

// Retrieves aggregated notifications from IndexedDB, filtering out expired ones
export async function getAggregatedNotificationsFromCache(): Promise<GitHubAggregated[]> {
  const db = await openNotificationsDB();
  const transaction = db.transaction([AGGREGATED_STORE], "readonly");
  const store = transaction.objectStore(AGGREGATED_STORE);

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const results = (request.result as unknown as (GitHubAggregated & { expiresAt?: number; id: number | string })[]) || [];
      resolve(filterValid(results));
    };
    request.onerror = () => reject(request.error);
  });
}

// Clears all notifications from IndexedDB cache
export async function clearNotificationsCache(): Promise<void> {
  const db = await openNotificationsDB();
  const transaction = db.transaction([NOTIFICATIONS_STORE, AGGREGATED_STORE], "readwrite");
  const notificationsStore = transaction.objectStore(NOTIFICATIONS_STORE);
  const aggregatedStore = transaction.objectStore(AGGREGATED_STORE);

  return new Promise((resolve, reject) => {
    const requests = [notificationsStore.clear(), aggregatedStore.clear()];

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject((transaction as IDBTransaction).error);
    requests.forEach((req) => {
      req.onerror = () => reject(req.error);
    });
  });
}

// Returns whether the notifications cache is still within TTL window
export async function isNotificationsCacheValid(): Promise<boolean> {
  const db = await openNotificationsDB();
  const transaction = db.transaction([NOTIFICATIONS_STORE, AGGREGATED_STORE], "readonly");
  const notificationsStore = transaction.objectStore(NOTIFICATIONS_STORE);
  const aggregatedStore = transaction.objectStore(AGGREGATED_STORE);

  return new Promise((resolve) => {
    const metaReq = notificationsStore.get(META_KEY);
    function resolveIfValid(meta: CacheMetaRecord | undefined) {
      if (!meta || !meta.expiresAt) return resolve(false);
      resolve(meta.expiresAt > Date.now());
    }

    metaReq.onsuccess = () => {
      const meta = metaReq.result as CacheMetaRecord | undefined;
      if (meta && meta.expiresAt) {
        resolveIfValid(meta);
      } else {
        const aggregatedMetaReq = aggregatedStore.get(META_KEY);
        aggregatedMetaReq.onsuccess = () => {
          resolveIfValid(aggregatedMetaReq.result as CacheMetaRecord | undefined);
        };
        aggregatedMetaReq.onerror = () => resolve(false);
      }
    };
    metaReq.onerror = () => resolve(false);
  });
}
