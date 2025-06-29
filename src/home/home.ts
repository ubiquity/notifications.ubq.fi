import { grid } from "../the-grid";
import { authentication } from "./authentication";
import { fetchAvatars } from "./fetch-github/fetch-avatar";
import { fetchAllNotifications } from "./fetch-github/fetch-data";
import { displayNotifications } from "./fetch-github/filter-and-display-notifications";
import { initPullToRefresh } from "./pull-to-refresh";
import { readyToolbar } from "./ready-toolbar";
import { renderServiceMessage } from "./render-service-message";
import { renderErrorInModal } from "./rendering/display-popup-modal";
import { renderGitRevision } from "./rendering/render-github-login-button";
import { generateSortingToolbar } from "./sorting/generate-sorting-buttons";

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

// This is made to make notifications global
export async function getNotifications() {
  if (!notifications) {
    notifications = await fetchAllNotifications();
  }
  return notifications;
}

// Function to clear the notifications cache
export function clearNotificationsCache() {
  notifications = undefined;
}

// Function to remove a specific notification from cache and force refresh
export async function removeNotificationFromCache(notificationId: string) {
  if (notifications) {
    notifications = notifications.filter((n) => n.notification.id.toString() !== notificationId);
  }
}

// Function to force fresh notifications fetch
export async function forceFreshNotifications() {
  clearNotificationsCache();
  return await getNotifications();
}

async function refreshNotifications() {
  clearNotificationsCache(); // Clear cache
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
