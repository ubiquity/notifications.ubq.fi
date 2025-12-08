import { grid } from "../the-grid";
import { authentication } from "./authentication";
import { fetchAvatars } from "./fetch-github/fetch-avatar";
import { fetchAllNotifications, fetchIssues, fetchPullRequests, processNotifications } from "./fetch-github/fetch-data";
import { displayNotifications } from "./fetch-github/filter-and-display-notifications";
import { initPullToRefresh } from "./pull-to-refresh";
import { readyToolbar } from "./ready-toolbar";
import { renderServiceMessage } from "./render-service-message";
import { renderErrorInModal } from "./rendering/display-popup-modal";
import { renderGitRevision } from "./rendering/render-github-login-button";
import { generateSortingToolbar } from "./sorting/generate-sorting-buttons";
import {
  clearNotificationsCache,
  getAggregatedNotificationsFromCache,
  getNotificationsFromCache,
  isNotificationsCacheValid,
  saveAggregatedNotificationsToCache,
} from "./getters/get-indexed-db";

import { setupAuth } from "./auth-config";
import { initMarkAsReadToggle } from "./mark-as-read";

// Set up authentication from environment variables
setupAuth();

// All unhandled errors are caught and displayed in a modal
window.addEventListener("error", (event: ErrorEvent) => renderErrorInModal(event.error));

// All unhandled promise rejections are caught and displayed in a modal
window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
  renderErrorInModal(event.reason as Error);
  event.preventDefault();
});

renderGitRevision();
generateSortingToolbar();
const hostname = window.location.hostname.replace(/\.$/, "").toLowerCase();

// Determine if we are on production domain
export const isProdDomain = hostname === "ubq.fi" || hostname.endsWith(".ubq.fi");
export const isTestMode = !isProdDomain;

renderServiceMessage();
initMarkAsReadToggle({ isProdDomain });

grid(document.getElementById("grid") as HTMLElement, () => document.body.classList.add("grid-loaded")); // @DEV: display grid background
export const notificationsContainer = document.getElementById("issues-container") as HTMLDivElement;

if (!notificationsContainer) {
  throw new Error("Could not find issues container");
}

// Should show bot
export let shouldShowBotNotifications = false;
export function flipShowBotNotifications() {
  shouldShowBotNotifications = !shouldShowBotNotifications;
}

// Store notifications
let notifications: Awaited<ReturnType<typeof fetchAllNotifications>> | undefined;

async function clearServiceWorkerApiCache() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: "CLEAR_API_CACHE" });
  } catch (error) {
    console.warn("Failed to clear API cache via service worker", error);
  }
}

// This is made to make notifications global
export async function getNotifications() {
  if (!notifications) {
    const isOnline = navigator.onLine !== false;
    const [cachedAggregated, cachedNotifications, isCacheValid] = await Promise.all([
      getAggregatedNotificationsFromCache(),
      getNotificationsFromCache(),
      isNotificationsCacheValid(),
    ]);

    if (isCacheValid) {
      // Prefer aggregated cache when TTL is valid, even if it contains zero items
      if (cachedAggregated.length || cachedNotifications.length === 0) {
        notifications = cachedAggregated;
        return notifications;
      }

      // Rebuild aggregated cache from raw cached notifications when available
      if (!cachedAggregated.length && cachedNotifications.length) {
        const [pullRequests, issues] = await Promise.all([fetchPullRequests(), fetchIssues()]);
        notifications = pullRequests && issues ? await processNotifications(cachedNotifications, pullRequests, issues) : null;
        if (notifications) {
          await saveAggregatedNotificationsToCache(notifications);
          return notifications;
        }
      }
    }

    // Offline fallback: return whatever aggregated cache exists even if TTL expired
    if (!isOnline) {
      notifications = cachedAggregated;
      return notifications;
    }

    notifications = await fetchAllNotifications();
    if (!notifications) {
      notifications = cachedAggregated;
    }
  }
  return notifications;
}

async function refreshNotifications() {
  notifications = undefined; // Clear in-memory cache
  await clearNotificationsCache(); // Clear IndexedDB cache
  await clearServiceWorkerApiCache(); // Invalidate SW API cache before refetch
  const newNotifications = await fetchAllNotifications();
  notifications = newNotifications ?? null;
  if (notifications) {
    await fetchAvatars(notifications);
  }
  await displayNotifications({ preloadedNotifications: notifications });
}

void (async function home() {
  void authentication();
  void readyToolbar();
  const notifications = await getNotifications();
  if (notifications) {
    await fetchAvatars(notifications);
  }
  void displayNotifications({ preloadedNotifications: notifications });

  // Initialize pull-to-refresh
  initPullToRefresh(refreshNotifications);

  // Register service worker for PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/progressive-web-app.js")
      .then(() => {
        console.log("Service worker registered");
      })
      .catch((err) => {
        console.log(err);
      });
  }
})();
