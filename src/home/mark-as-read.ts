import { getGitHubAccessToken } from "./getters/get-github-access-token";
import { GitHubNotification } from "./github-types";

const STORAGE_KEY = "ubq.markAsReadEnabled";
let canAllowMarkAsRead = false;

function readStoredPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "true";
  } catch {
    return false;
  }
}

function persistPreference(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Ignore persistence issues; runtime flag is enough for the session.
  }
}

function applyToggleLabel(label: HTMLDivElement, enabled: boolean) {
  label.textContent = enabled ? "Mark-as-read enabled for testing" : "Test mode: mark-as-read blocked";
}

export function initMarkAsReadToggle({ isProdDomain }: { isProdDomain: boolean }) {
  canAllowMarkAsRead = isProdDomain || readStoredPreference();
  if (isProdDomain) return;

  const existing = document.getElementById("mark-as-read-toggle");
  if (existing) return;

  const toggle = document.createElement("label");
  toggle.id = "mark-as-read-toggle";
  toggle.classList.add("mark-as-read-toggle");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = canAllowMarkAsRead;
  checkbox.classList.add("mark-as-read-checkbox");

  const textWrapper = document.createElement("div");
  textWrapper.classList.add("mark-as-read-text");
  const heading = document.createElement("div");
  heading.classList.add("mark-as-read-heading");
  applyToggleLabel(heading, checkbox.checked);

  const caption = document.createElement("div");
  caption.textContent = "Enable to let notification clicks mark threads as read while testing locally.";
  caption.classList.add("mark-as-read-caption");

  textWrapper.appendChild(heading);
  textWrapper.appendChild(caption);

  checkbox.addEventListener("change", () => {
    canAllowMarkAsRead = checkbox.checked;
    persistPreference(canAllowMarkAsRead);
    applyToggleLabel(heading, canAllowMarkAsRead);
  });

  toggle.appendChild(checkbox);
  toggle.appendChild(textWrapper);
  document.body.appendChild(toggle);
}

export function isMarkAsReadAllowed() {
  return canAllowMarkAsRead;
}

export async function markNotificationAsRead(notification: GitHubNotification) {
  if (!canAllowMarkAsRead) return;
  if (!notification?.unread) return;

  const threadUrl = notification.url;
  if (!threadUrl) return;

  const token = await getGitHubAccessToken();
  if (!token) return;

  try {
    const response = await fetch(threadUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      console.warn("Failed to mark notification as read", threadUrl, response.status);
    }
  } catch (error) {
    console.warn("Error marking notification as read", threadUrl, error);
  }
}
