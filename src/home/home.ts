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
renderServiceMessage();
renderTestModeToast();

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

// Determine if we are on production domain
export const isProdDomain = window.location.hostname.endsWith("ubq.fi");
export const isTestMode = !isProdDomain;

// Toggle auto mark-on-view (default on in prod, off in test)
export let shouldAutoMarkNotifications = isProdDomain;
export function flipAutoMarkNotifications() {
  shouldAutoMarkNotifications = !shouldAutoMarkNotifications;
}

function renderTestModeToast() {
  if (isProdDomain) return;
  const existing = document.getElementById("test-mode-toast");
  if (existing) return;
  const toast = document.createElement("div");
  toast.id = "test-mode-toast";
  toast.textContent = "Test mode: mark-as-read disabled off ubq.fi";
  toast.style.position = "fixed";
  toast.style.bottom = "12px";
  toast.style.left = "12px";
  toast.style.padding = "10px 12px";
  toast.style.background = "rgba(20, 20, 20, 0.9)";
  toast.style.color = "#fff";
  toast.style.borderRadius = "6px";
  toast.style.fontSize = "12px";
  toast.style.zIndex = "9999";
  toast.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
  document.body.appendChild(toast);
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

    // Use fresh aggregated cache when valid
    if (isCacheValid && cachedAggregated.length) {
      notifications = cachedAggregated;
      return notifications;
    }

    // Fallback: rebuild aggregated cache from raw cached notifications
    if (isCacheValid && cachedNotifications.length) {
      const [pullRequests, issues] = await Promise.all([fetchPullRequests(), fetchIssues()]);
      notifications = pullRequests && issues ? await processNotifications(cachedNotifications, pullRequests, issues) : null;
      if (notifications) {
        await saveAggregatedNotificationsToCache(notifications);
        return notifications;
      }
    }

    // Offline fallback: return whatever aggregated cache exists even if TTL expired
    if (!isOnline && cachedAggregated.length) {
      notifications = cachedAggregated;
      return notifications;
    }

    notifications = await fetchAllNotifications();
    if (!notifications && cachedAggregated.length) {
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
  if (newNotifications) {
    await fetchAvatars(newNotifications);
  }
  await displayNotifications();
}

void (async function home() {
  void authentication();
  void readyToolbar();
  const notifications = await getNotifications();
  if (notifications) {
    await fetchAvatars(notifications);
  }
  void displayNotifications();

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
