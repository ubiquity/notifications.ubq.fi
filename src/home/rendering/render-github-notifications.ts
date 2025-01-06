import { organizationImageCache } from "../fetch-github/fetch-data";
import { GitHubAggregated } from "../github-types";
import { getTimeAgo } from "./utils";
import { notificationsContainer } from "../home";
import { getGitHubAccessToken } from "../getters/get-github-access-token";

export function renderNotifications(notifications: GitHubAggregated[], skipAnimation: boolean) {
  if (notificationsContainer.classList.contains("ready")) {
    notificationsContainer.classList.remove("ready");
    notificationsContainer.innerHTML = "";
  }
  const existingNotificationIds = new Set(
    Array.from(notificationsContainer.querySelectorAll(".issue-element-inner")).map((element) => element.getAttribute("data-issue-id"))
  );

  let delay = 0;
  const baseDelay = 1000 / 15; // Base delay in milliseconds

  const notificationsToUpdate: { element: HTMLElement; notification: GitHubAggregated }[] = [];

  for (const notification of notifications) {
    if (!existingNotificationIds.has(notification.notification.id.toString())) {
      const issueWrapper = everyNewNotification({ notification: notification, notificationsContainer });
      if (issueWrapper) {
        if (skipAnimation) {
          issueWrapper.classList.add("active");
        } else {
          setTimeout(() => issueWrapper.classList.add("active"), delay);
          delay += baseDelay;
        }

        notificationsToUpdate.push({ element: issueWrapper, notification });
      }
    }
  }
  notificationsContainer.classList.add("ready");

  // Scroll to the top of the page
  window.scrollTo({ top: 0 });

  void updateLatestCommentUrls(notificationsToUpdate);
}
export function renderEmpty() {
  if (notificationsContainer.classList.contains("ready")) {
    notificationsContainer.classList.remove("ready");
    notificationsContainer.innerHTML = "";
  }
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

// this is used for cloning to speed up in loop
const notificationTemplate = document.createElement("div");
notificationTemplate.innerHTML = `
  <div class="issue-element-inner">
    <div class="content">
      <!-- dynamic content will be inserted here -->
    </div>
  </div>
`;

function everyNewNotification({ notification, notificationsContainer }: { notification: GitHubAggregated; notificationsContainer: HTMLDivElement }) {
  // clone the template
  const issueWrapper = notificationTemplate.cloneNode(true) as HTMLDivElement;
  const issueElement = issueWrapper.querySelector(".issue-element-inner") as HTMLDivElement;

  issueElement.setAttribute("data-issue-id", notification.notification.id.toString());
  issueElement.classList.add("issue-element-inner");

  const labels = parseAndGenerateLabels(notification);
  const [organizationName, repositoryName] = notification.notification.repository.url.split("/").slice(-2);

  setUpIssueElement(issueElement, notification, organizationName, repositoryName, labels);
  issueWrapper.appendChild(issueElement);

  notificationsContainer.appendChild(issueWrapper);
  return issueWrapper;
}

function setUpIssueElement(issueElement: HTMLDivElement, notification: GitHubAggregated, organizationName: string, repositoryName: string, labels: string[]) {
  const image = `<img />`;

  issueElement.innerHTML = `
    <div class="info">
      <div class="notification-icon"></div>
      <div class="text-info">
        <div class="title">
          <h3>${notification.notification.subject.title}</h3>
        </div>
        <div class="partner">
          <div class="full-repo-name">
            <p class="organization-name">${organizationName}</p>
            <p class="repository-name">${repositoryName}</p>
          </div>
          <p class="issue-number">#${notification.notification.subject.url.split("/").slice(-1)}</p>
        </div>
      </div>
    </div>
    <div class="latest-comment-preview"></div>
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

// fetches latest comment from each notification and add click event to open the comment
async function updateLatestCommentUrls(notificationsToUpdate: { element: HTMLElement; notification: GitHubAggregated }[]) {
  const providerToken = await getGitHubAccessToken();
  const fetchPromises = notificationsToUpdate.map(async ({ element, notification }) => {
    const { subject } = notification.notification;
    let url = "";
    let userType = "";
    let avatarUrl = "";
    let commentBody = "";

    if (subject.latest_comment_url) {
      try {
        const response = await fetch(subject.latest_comment_url, {
          headers: { Authorization: `Bearer ${providerToken}` },
        });
        const data = await response.json();
        console.log("data", data);
        url = data.html_url;
        userType = data.user.type;
        avatarUrl = data.user.avatar_url; // get the comment author's avatar
        commentBody = data.body; // get the comment body text

        if(userType === "Bot") {
          element.style.display = "none";
        }

        // check if commentBody contains HTML
        const parser = new DOMParser();
        const parsedDoc = parser.parseFromString(commentBody, "text/html");
        if (parsedDoc.body.children.length > 0) {
          commentBody = "This comment is in HTML format.";
        }
      } catch (error) {
        console.error("Failed to fetch latest comment URL:", error);
      }
    }

    if (!url) {
      url = notification.issue?.html_url || notification.pullRequest?.html_url || "#";
    }

    // update the rendered element with the real URL
    const issueElement = element.querySelector(".issue-element-inner");
    const previewElement = issueElement?.querySelector(".latest-comment-preview");

    if (previewElement) {
      previewElement.innerHTML = `
        <div class="comment-preview">
          <img src="${avatarUrl ? avatarUrl : ""}" class="comment-avatar"/>
          <span class="comment-body">${commentBody ? commentBody : "No comment available."}</span>
        </div>
      `;
    }
    if (issueElement) {
      issueElement.addEventListener("click", () => window.open(url, "_blank"));
    }
  });

  await Promise.all(fetchPromises);
}

// Listen for changes in view toggle and update the URL accordingly
export const proposalViewToggle = document.getElementById("view-toggle") as HTMLInputElement;
proposalViewToggle.addEventListener("change", () => {
  // const newURL = new URL(window.location.href);
  // if (proposalViewToggle.checked) {
  //   newURL.searchParams.set("proposal", "true");
  // } else {
  //   newURL.searchParams.delete("proposal");
  // }
  // window.history.replaceState({}, "", newURL.toString());
});

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
