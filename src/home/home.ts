import { grid } from "../the-grid";
import { authentication } from "./authentication";
import { displayNotifications } from "./fetch-github/filter-and-display-notifications";
import { fetchAvatars } from "./fetch-github/fetch-avatar";
import { fetchAllNotifications } from "./fetch-github/fetch-data";
import { readyToolbar } from "./ready-toolbar";
import { renderServiceMessage } from "./render-service-message";
import { renderErrorInModal } from "./rendering/display-popup-modal";
import { renderGitRevision } from "./rendering/render-github-login-button";
import { generateSortingToolbar } from "./sorting/generate-sorting-buttons";

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
export let showBotNotifications = false;
export const flipShowBotNotifications = () => {
  showBotNotifications = !showBotNotifications;
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

void (async function home() {
  void authentication();
  void readyToolbar();
  const notifications = await getNotifications();
  if(notifications){
    await fetchAvatars(notifications);
  }
  void displayNotifications();

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
