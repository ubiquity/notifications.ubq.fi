import { marked } from "marked";
import { organizationImageCache } from "../fetch-github/fetch-data";
import { GitHubAggregated, GitHubIssue, GitHubNotification, GitHubNotifications } from "../github-types";
import { renderErrorInModal } from "./display-popup-modal";
import { closeModal, modal, modalBodyInner, bottomBar, titleAnchor, titleHeader, bottomBarClearLabels } from "./render-preview-modal";
import { setupKeyboardNavigation } from "./setup-keyboard-navigation";
import { getTimeAgo, waitForElement } from "./utils";
import { notificationsContainer } from "../home";

export async function renderNotifications(notifications: GitHubAggregated[], skipAnimation: boolean) {
  if (notificationsContainer.classList.contains("ready")) {
    notificationsContainer.classList.remove("ready");
    notificationsContainer.innerHTML = "";
  }
  const existingNotificationIds = new Set(
    Array.from(notificationsContainer.querySelectorAll(".issue-element-inner")).map((element) => element.getAttribute("data-issue-id"))
  );

  let delay = 0;
  const baseDelay = 1000 / 15; // Base delay in milliseconds

  for (const notification of notifications) {
    if (!existingNotificationIds.has(notification.notification.id.toString())) {
      const issueWrapper = await everyNewNotification({ notification: notification, notificationsContainer });
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
  //setupKeyboardNavigation(notificationsContainer);

  // Scroll to the top of the page
  window.scrollTo({ top: 0 });
}
export function renderEmpty(){
  const issueWrapper = document.createElement("div");
  issueWrapper.style.marginTop = "20px";
  const issueElement = document.createElement("div");
  issueElement.innerHTML = `
    <div class="info"><div class="title"><h3>No notifications found</h3></div></div>
  `;
  issueElement.classList.add("issue-element-inner");
  issueWrapper.appendChild(issueElement);
  notificationsContainer.appendChild(issueWrapper);

  issueWrapper.classList.add("active");
  notificationsContainer.classList.add("ready");
}

async function everyNewNotification({ notification, notificationsContainer }: { notification: GitHubAggregated; notificationsContainer: HTMLDivElement }) {
  const issueWrapper = document.createElement("div");
  const issueElement = document.createElement("div");
  issueElement.setAttribute("data-issue-id", notification.notification.id.toString());
  issueElement.classList.add("issue-element-inner");

  const labels = parseAndGenerateLabels(notification);
  const [organizationName, repositoryName] = notification.notification.repository.url.split("/").slice(-2);
  
  let url;
  if (notification.notification.subject.latest_comment_url) {
    try {
      const response = await fetch(notification.notification.subject.latest_comment_url);
      const data = await response.json();
      url = data.html_url;
    } catch (error) {
      console.error("Failed to fetch latest comment URL:", error);
    }
  }
  if(!url){
    if(notification.notification.subject.type === "Issue"){
      url = notification.issue.html_url;
    } else if(notification.notification.subject.type === "PullRequest"){
      url = notification.pullRequest?.html_url as string;
    }
  }
  
  setUpIssueElement(issueElement, notification, organizationName, repositoryName, labels, url as string);
  issueWrapper.appendChild(issueElement);

  notificationsContainer.appendChild(issueWrapper);
  return issueWrapper;
}

function setUpIssueElement(
  issueElement: HTMLDivElement,
  notification: GitHubAggregated,
  organizationName: string,
  repositoryName: string,
  labels: string[],
  url: string
) {
  const image = `<img />`;

  issueElement.innerHTML = `
    <div class="info">
      <div class="notification-icon"></div>
      <div class="text-info">
        <div class="title">
          <h3>${notification.notification.subject.title}</h3>
        </div>
        <div class="partner">
          <p class="organization-name">${organizationName}</p>
          <p class="repository-name">${repositoryName}</p>
        </div>
      </div>
    </div>
    <div class="labels">
      ${labels.join("")}
      ${image}
    </div>`;

  const notificationIcon = issueElement.querySelector(".notification-icon");

  if (notification.notification.subject.type === "Issue" && notificationIcon) {
      notificationIcon.innerHTML = `
      <svg class="octicon octicon-issue-opened" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true">
        <path fill="#888" d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path>
        <path fill="#888" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"></path>
      </svg>
      `;
  } else if (notification.notification.subject.type === "PullRequest" && notificationIcon) {
      notificationIcon.innerHTML = `
      <svg class="octicon octicon-git-pull-request  color-fg-open" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true">
        <path fill="#888" d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"></path>
        </svg>
      `;
  }
  
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

      window.open(url, "_blank");

    } catch (error) {
      return renderErrorInModal(error as Error);
    }
  });
}

function parseAndGenerateLabels(notification: GitHubAggregated) {
  const labels: string[] = [];

  // Add priority label
  if (notification.issue.labels) {
    notification.issue.labels.forEach((label) => {
      // check if label is a single string
      if (typeof label === "string") {
        return;
      }

      // check if label.name exists
      if (!label.name) {
        return;
      }

      const match = label.name.match(/^(Priority): /);
      if (match) {
        const name = label.name.replace(match[0], "");
        const labelStr = `<label class="priority">${name}</label>`;
        labels.push(labelStr);
      }
    });
  }

  // Add reason label
  if (notification.notification.reason) {
    const reason = notification.notification.reason.replace(/_/g, " ");
    labels.push(`<label class="reason">${reason}</label>`);
  }

  // Add timestamp label
  if (notification.notification.updated_at) {
    const timeAgo = getTimeAgo(new Date(notification.notification.updated_at));
    labels.push(`<label class="timestamp">${timeAgo}</label>`);
  }

  return labels;
} 
// // Function to update and show the preview
// function previewIssue(notification: GitHubNotifications) {
//   void viewIssueDetails(notification);
// }

// // Loads the issue preview modal with the issue details
// export async function viewIssueDetails(full: GitHubNotifications) {
//   // Update the title and body for the new issue
//   titleHeader.textContent = full.title;
//   titleAnchor.href = full.html_url;
//   if (!full.body) return;

//   // Remove any existing cloned labels from the bottom bar
//   bottomBarClearLabels();

//   // Wait for the issue element to exist, useful when loading issue from URL
//   const issueElement = await waitForElement(`div[data-issue-id="${full.id}"]`);

//   const labelsDiv = issueElement.querySelector(".labels");
//   if (labelsDiv) {
//     // Clone the labels div and remove the img child if it exists
//     const clonedLabels = labelsDiv.cloneNode(true) as HTMLElement;
//     const imgElement = clonedLabels.querySelector("img");
//     if (imgElement) clonedLabels.removeChild(imgElement);

//     // Add an extra class and set padding
//     clonedLabels.classList.add("cloned-labels");

//     // Prepend the cloned labels to the modal body
//     bottomBar.prepend(clonedLabels);
//   }

//   // Set the issue body content using `marked`
//   modalBodyInner.innerHTML = marked(full.body) as string;

//   // Show the preview
//   modal.classList.add("active");
//   modal.classList.remove("error");
//   document.body.classList.add("preview-active");

//   updateUrlWithIssueId(full.id);
// }

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

// // Adds issue ID to url in format (i.e http://localhost:8080/?issue=2559612103)
// function updateUrlWithIssueId(issueID: number) {
//   const newURL = new URL(window.location.href);
//   newURL.searchParams.set("issue", String(issueID));

//   // Set issue in URL
//   window.history.replaceState({ issueID }, "", newURL.toString());
// }

// // Opens the preview modal if a URL contains an issueID
// export function loadIssueFromUrl() {
//   const urlParams = new URLSearchParams(window.location.search);
//   const issueID = urlParams.get("issue");

//   // If no issue ID in the URL, don't load issue
//   if (!issueID) {
//     closeModal();
//     return;
//   }

//   // If ID doesn't exist, don't load issue
//   const issue: GitHubNotifications = notificationManager.getnotificationById(Number(issueID)) as GitHubNotifications;

//   if (!issue) {
//     const newURL = new URL(window.location.href);
//     newURL.searchParams.delete("issue");
//     window.history.pushState({}, "", newURL.toString());
//     return;
//   }

//   void viewIssueDetails(issue);
// }

export function applyAvatarsToNotifications() {
  const notificationsContainer = document.getElementById("issues-container") as HTMLDivElement;
  const notificationElements = Array.from(notificationsContainer.querySelectorAll(".issue-element-inner"));

  notificationElements.forEach((issueElement) => {
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
