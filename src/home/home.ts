import { grid } from "../the-grid";
import { authentication } from "./authentication";
import { displayGitHubIssues } from "./fetch-github/fetch-and-display-previews";
import { postLoadUpdateIssues } from "./fetch-github/fetch-issues-full";
import { readyToolbar } from "./ready-toolbar";
import { renderServiceMessage } from "./render-service-message";
import { renderErrorInModal } from "./rendering/display-popup-modal";
import { loadIssueFromUrl } from "./rendering/render-github-issues";
import { renderGitRevision } from "./rendering/render-github-login-button";
import { generateSortingToolbar } from "./sorting/generate-sorting-buttons";
import { TaskManager } from "./task-manager";

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
const container = document.getElementById("issues-container") as HTMLDivElement;

if (!container) {
  throw new Error("Could not find issues container");
}

export const taskManager = new TaskManager(container);

void (async function home() {
  void authentication();
  void readyToolbar();
  await taskManager.syncTasks(); // Sync tasks from cache on load
  loadIssueFromUrl(); // Load issue preview from URL if present
  void displayGitHubIssues(); // Display issues from cache
  await postLoadUpdateIssues(); // Update cache and issues if cache is outdated

  // Register service worker for PWA
  // if ("serviceWorker" in navigator) {
  //   navigator.serviceWorker
  //     .register("/progressive-web-app.js")
  //     .then(() => {
  //       console.log("Service worker registered");
  //     })
  //     .catch((err) => {
  //       console.log(err);
  //     });
  // }
})();
