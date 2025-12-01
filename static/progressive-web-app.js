const staticCacheName = "pwacache-v6"; // v6: TTL for API cache + SW-driven invalidation
const apiCacheName = "pwacache-api-v1";
const API_TTL_MS = 10 * 60 * 1000; // 10 minutes
const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json",
  "/dist/src/home/home.js",
  "/style/style.css",
  "/style/inverted-style.css",
  "/style/fonts/ubiquity-nova-standard.woff",
  "/style/special.css",
  "/favicon.svg",
];

// Install event (caches all necessary files)
self.addEventListener("install", async (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(staticCacheName);
        await cache.addAll(urlsToCache);
        console.log("[Service Worker] Files cached successfully");
      } catch (error) {
        console.error("[Service Worker] Cache failed:", error);
      }
      self.skipWaiting(); // Activate the new worker immediately
    })()
  );
});

// Activate event (deletes old caches when updated)
self.addEventListener("activate", async (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map((name) => {
            if (![staticCacheName, apiCacheName].includes(name)) {
              return caches.delete(name);
            }
          })
        );
        console.log("[Service Worker] Old caches removed");
      } catch (error) {
        console.error("[Service Worker] Error during activation:", error);
      }
      self.clients.claim(); // Take control of all pages immediately
    })()
  );
});

// Fetch event: Cache first for static assets, network first for API
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Ignore non-HTTP(S) requests (like 'chrome-extension://')
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Network-first for GitHub API with short-lived cache; skip caching auth-bearing requests
  if (url.hostname === "api.github.com") {
    event.respondWith(handleApiRequest(event.request));
    return;
  }

  // If the request has query parameters, bypass the cache
  if (url.search) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(event.request);

      if (cachedResponse) {
        // Start a network fetch in the background to update the cache
        event.waitUntil(updateStaticCache(event.request));
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          event.waitUntil(cacheStaticResponse(event.request, networkResponse.clone()));
        }
        return networkResponse;
      } catch (error) {
        console.error("[Service Worker] Fetch failed, and no cache is available:", error);
        return new Response("An error occurred", {
          status: 500,
          statusText: "Internal Server Error",
        });
      }
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_API_CACHE") {
    event.waitUntil(caches.delete(apiCacheName));
  }
});

async function handleApiRequest(request) {
  const hasAuth = request.headers.get("authorization");
  if (hasAuth) {
    try {
      return await fetch(request);
    } catch (error) {
      console.log("[Service Worker] Authenticated API request failed, no cache used:", request.url, error);
      return new Response("Network error", {
        status: 503,
        statusText: "Service Unavailable",
      });
    }
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cacheApiResponse(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log("[Service Worker] Network failed, trying cache for API:", request.url);
    const cache = await caches.open(apiCacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse && !isApiCacheStale(cachedResponse)) {
      return cachedResponse;
    }
    console.error("[Service Worker] API fetch failed and no fresh cache available:", error);
    return new Response("Network error", {
      status: 503,
      statusText: "Service Unavailable",
    });
  }
}

async function cacheApiResponse(request, response) {
  const cache = await caches.open(apiCacheName);
  const headers = new Headers(response.headers);
  headers.set("sw-fetched-at", Date.now().toString());
  const buffer = await response.arrayBuffer();
  const responseToCache = new Response(buffer, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  await cache.put(request, responseToCache);
}

function isApiCacheStale(response) {
  const fetchedAt = Number(response.headers.get("sw-fetched-at"));
  if (Number.isFinite(fetchedAt)) {
    return Date.now() - fetchedAt > API_TTL_MS;
  }
  const dateHeader = response.headers.get("date");
  if (dateHeader) {
    const parsed = Date.parse(dateHeader);
    if (!Number.isNaN(parsed)) {
      return Date.now() - parsed > API_TTL_MS;
    }
  }
  return true;
}

async function updateStaticCache(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cacheStaticResponse(request, networkResponse.clone());
    }
  } catch (error) {
    console.error("[Service Worker] Background cache update failed:", error);
  }
}

async function cacheStaticResponse(request, response) {
  try {
    const cache = await caches.open(staticCacheName);
    await cache.put(request, response);
  } catch (error) {
    console.error(`[Service Worker] Failed to cache resource: ${request.url}`);
  }
}
