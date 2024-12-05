import { marked } from "marked";
import { organizationImageCache } from "../fetch-github/fetch-notifications";
import { GitHubNotification, GitHubNotifications } from "../github-types";
import { renderErrorInModal } from "./display-popup-modal";
import { closeModal, modal, modalBodyInner, bottomBar, titleAnchor, titleHeader, bottomBarClearLabels } from "./render-preview-modal";
import { setupKeyboardNavigation } from "./setup-keyboard-navigation";
import { waitForElement } from "./utils";
import { notificationsContainer } from "../home";

export function renderNotifications(tasks: GitHubNotifications, skipAnimation: boolean) {
  if (notificationsContainer.classList.contains("ready")) {
    notificationsContainer.classList.remove("ready");
    notificationsContainer.innerHTML = "";
  }
  const existingIssueIds = new Set(Array.from(notificationsContainer.querySelectorAll(".issue-element-inner")).map((element) => element.getAttribute("data-issue-id")));

  let delay = 0;
  const baseDelay = 1000 / 15; // Base delay in milliseconds

  for (const task of tasks) {
    if (!existingIssueIds.has(task.id.toString())) {
      const issueWrapper = everyNewNotification({ notification: task, notificationsContainer });
      if (issueWrapper) {
        if (skipAnimation) {
          issueWrapper.classList.add("active");
        } else {
          setTimeout(() => issueWrapper.classList.add("active"), delay);
          delay += baseDelay;
        }
      }
    }
  }
  notificationsContainer.classList.add("ready");
  // Call this function after the issues have been rendered
  setupKeyboardNavigation(notificationsContainer);

  // Scroll to the top of the page
  window.scrollTo({ top: 0 });
}

function everyNewNotification({ notification, notificationsContainer }: { notification: GitHubNotification; notificationsContainer: HTMLDivElement }) {
  const issueWrapper = document.createElement("div");
  const issueElement = document.createElement("div");
  issueElement.setAttribute("data-issue-id", notification.id.toString());
  issueElement.classList.add("issue-element-inner");

  const labels = parseAndGenerateLabels(notification);
  const [organizationName, repositoryName] = notification.repository.url.split("/").slice(-2);
  setUpIssueElement(issueElement, notification, organizationName, repositoryName, labels, notification.html_url);
  issueWrapper.appendChild(issueElement);

  notificationsContainer.appendChild(issueWrapper);
  return issueWrapper;
}

function setUpIssueElement(issueElement: HTMLDivElement, task: GitHubNotifications, organizationName: string, repositoryName: string, labels: string[], url: string) {
  const image = `<img />`;

  issueElement.innerHTML = `
      <div class="info"><div class="title"><h3>${
        task.title
      }</h3></div><div class="partner"><p class="organization-name">${organizationName}</p><p class="repository-name">${repositoryName}</p></div></div><div class="labels">${labels.join(
        ""
      )}${image}</div>`;

  issueElement.addEventListener("click", () => {
    try {
      const issueWrapper = issueElement.parentElement;

      if (!issueWrapper) {
        throw new Error("No issue notificationsContainer found");
      }

      Array.from(issueWrapper.parentElement?.children || []).forEach((sibling) => {
        sibling.classList.remove("selected");
      });

      issueWrapper.classList.add("selected");

      const full = task;
      if (!full) {
        window.open(url, "_blank");
      } else {
        previewIssue(task);
      }
    } catch (error) {
      return renderErrorInModal(error as Error);
    }
  });
}

function parseAndGenerateLabels(task: GitHubNotifications) {
  type LabelKey = "Price: " | "Time: " | "Priority: ";

  const labelOrder: Record<LabelKey, number> = { "Price: ": 1, "Time: ": 2, "Priority: ": 3 };

  const { labels, otherLabels } = task.labels.reduce(
    (acc, label) => {
      // check if label is a single string
      if (typeof label === "string") {
        return {
          labels: [],
          otherLabels: [],
        };
      }

      // check if label.name exists
      if (!label.name) {
        return {
          labels: [],
          otherLabels: [],
        };
      }

      const match = label.name.match(/^(Price|Time|Priority): /);
      if (match) {
        const name = label.name.replace(match[0], "");
        const labelStr = `<label class="${match[1].toLowerCase().trim()}">${name}</label>`;
        acc.labels.push({ order: labelOrder[match[0] as LabelKey], label: labelStr });
      } else if (!label.name.startsWith("Partner: ") && !label.name.startsWith("id: ") && !label.name.startsWith("Unavailable")) {
        acc.otherLabels.push(label.name);
      }
      return acc;
    },
    { labels: [] as { order: number; label: string }[], otherLabels: [] as string[] }
  );

  // Sort labels
  labels.sort((a: { order: number }, b: { order: number }) => a.order - b.order);

  // Log the other labels
  if (otherLabels.length) {
    const otherLabelName = otherLabels.shift() as string;
    labels.unshift({ order: 0, label: `<label class="label full">${otherLabelName}</label>` });
  }

  return labels.map((label) => label.label);
}

// Function to update and show the preview
function previewIssue(notification: GitHubNotifications) {
  void viewIssueDetails(notification);
}

// Loads the issue preview modal with the issue details
export async function viewIssueDetails(full: GitHubNotifications) {
  // Update the title and body for the new issue
  titleHeader.textContent = full.title;
  titleAnchor.href = full.html_url;
  if (!full.body) return;

  // Remove any existing cloned labels from the bottom bar
  bottomBarClearLabels();

  // Wait for the issue element to exist, useful when loading issue from URL
  const issueElement = await waitForElement(`div[data-issue-id="${full.id}"]`);

  const labelsDiv = issueElement.querySelector(".labels");
  if (labelsDiv) {
    // Clone the labels div and remove the img child if it exists
    const clonedLabels = labelsDiv.cloneNode(true) as HTMLElement;
    const imgElement = clonedLabels.querySelector("img");
    if (imgElement) clonedLabels.removeChild(imgElement);

    // Add an extra class and set padding
    clonedLabels.classList.add("cloned-labels");

    // Prepend the cloned labels to the modal body
    bottomBar.prepend(clonedLabels);
  }

  // Set the issue body content using `marked`
  modalBodyInner.innerHTML = marked(full.body) as string;

  // Show the preview
  modal.classList.add("active");
  modal.classList.remove("error");
  document.body.classList.add("preview-active");

  updateUrlWithIssueId(full.id);
}

// Listen for changes in view toggle and update the URL accordingly
export const proposalViewToggle = document.getElementById("view-toggle") as HTMLInputElement;
proposalViewToggle.addEventListener("change", () => {
  const newURL = new URL(window.location.href);
  if (proposalViewToggle.checked) {
    newURL.searchParams.set("proposal", "true");
  } else {
    newURL.searchParams.delete("proposal");
  }
  window.history.replaceState({}, "", newURL.toString());
});

// Adds issue ID to url in format (i.e http://localhost:8080/?issue=2559612103)
function updateUrlWithIssueId(issueID: number) {
  const newURL = new URL(window.location.href);
  newURL.searchParams.set("issue", String(issueID));

  // Set issue in URL
  window.history.replaceState({ issueID }, "", newURL.toString());
}

// Opens the preview modal if a URL contains an issueID
export function loadIssueFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const issueID = urlParams.get("issue");

  // If no issue ID in the URL, don't load issue
  if (!issueID) {
    closeModal();
    return;
  }

  // If ID doesn't exist, don't load issue
  const issue: GitHubNotifications = taskManager.getnotificationById(Number(issueID)) as GitHubNotifications;

  if (!issue) {
    const newURL = new URL(window.location.href);
    newURL.searchParams.delete("issue");
    window.history.pushState({}, "", newURL.toString());
    return;
  }

  void viewIssueDetails(issue);
}

export function applyAvatarsToIssues() {
  const notificationsContainer = taskManager.getnotificationsContainer();
  const issueElements = Array.from(notificationsContainer.querySelectorAll(".issue-element-inner"));

  issueElements.forEach((issueElement) => {
    const orgName = issueElement.querySelector(".organization-name")?.textContent;
    if (orgName) {
      const avatarUrl = organizationImageCache.get(orgName);
      if (avatarUrl) {
        const avatarImg = issueElement.querySelector("img");
        if (avatarImg) {
          avatarImg.src = URL.createObjectURL(avatarUrl);
        }
      }
    }
  });
}
