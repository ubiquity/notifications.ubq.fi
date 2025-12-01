import { GitHubNotifications, GitHubNotification } from "../github-types";

// Represents a cached notification record stored in IndexedDB
interface CachedNotificationDB extends GitHubNotification {
  cachedAt: number;
  expiresAt: number;
}
type CachedNotificationRecord = CachedNotificationDB & { id: number | string };

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
    const request = indexedDB.open("NotificationsDB", 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("notifications")) {
        db.createObjectStore("notifications", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
// Saves fetched notifications into IndexedDB with TTL and removes stale notifications
export async function saveNotificationsToCache(cachedNotifications: GitHubNotifications, fetchedNotifications: GitHubNotifications): Promise<void> {
  const db = await openNotificationsDB();
  const transaction = db.transaction("notifications", "readwrite");
  const store = transaction.objectStore("notifications");

  // Identify and remove stale notifications (in cache but not in fetched list)
  const staleNotifications = cachedNotifications.filter(
    (cachedNotification: GitHubNotification) => !fetchedNotifications.some((notification: GitHubNotification) => notification.id === cachedNotification.id)
  );
  for (const notification of staleNotifications) {
    store.delete(notification.id);
  }

  // Save or update fetched notifications with TTL timestamp
  const now = Date.now();
  const ttl = 60 * 60 * 1000; // 1 hour in milliseconds
  for (const notification of fetchedNotifications) {
    const item = {
      ...notification,
      cachedAt: now,
      expiresAt: now + ttl,
    };
    store.put(item);
  }

  // Write/update a sentinel meta record to track cache freshness even when there are zero notifications
  const meta = { id: "-1", cachedAt: now, expiresAt: now + ttl } as unknown as CachedNotificationRecord;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (store as any).put(meta);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => reject((event.target as IDBTransaction).error);
  });
}

// Retrieves notifications from IndexedDB, filtering out expired ones
export async function getNotificationsFromCache(): Promise<GitHubNotifications> {
  const db = await openNotificationsDB();
  const transaction = db.transaction("notifications", "readonly");
  const store = transaction.objectStore("notifications");

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const now = Date.now();
      const results = (request.result as unknown as CachedNotificationRecord[]) || [];
      // Filter out meta record (id === -1) and expired notifications
      const validNotifications = results
        .filter((item) => item.id !== "-1")
        .filter((item) => (item.expiresAt ? item.expiresAt > now : true)) as unknown as GitHubNotifications;
      resolve(validNotifications);
    };
    request.onerror = () => reject(request.error);
  });
}

// Clears all notifications from IndexedDB cache
export async function clearNotificationsCache(): Promise<void> {
  const db = await openNotificationsDB();
  const transaction = db.transaction("notifications", "readwrite");
  const store = transaction.objectStore("notifications");

  return new Promise((resolve, reject) => {
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Returns whether the notifications cache is still within TTL window
export async function isNotificationsCacheValid(): Promise<boolean> {
  const db = await openNotificationsDB();
  const transaction = db.transaction("notifications", "readonly");
  const store = transaction.objectStore("notifications");

  return new Promise((resolve) => {
    const metaReq = store.get(-1);
    metaReq.onsuccess = () => {
      const meta = metaReq.result as unknown as CachedNotificationDB | undefined;
      if (!meta || !meta.expiresAt) return resolve(false);
      resolve(meta.expiresAt > Date.now());
    };
    metaReq.onerror = () => resolve(false);
  });
}
