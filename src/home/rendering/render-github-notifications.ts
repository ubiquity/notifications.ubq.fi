import { organizationImageCache } from "../fetch-github/fetch-data";
import { GitHubAggregated } from "../github-types";
import { getTimeAgo } from "./utils";
import { notificationsContainer, showBotNotifications } from "../home";
import { getGitHubAccessToken } from "../getters/get-github-access-token";
import { Octokit } from "@octokit/rest";

export async function renderNotifications(notifications: GitHubAggregated[], skipAnimation: boolean) {
  const providerToken = await getGitHubAccessToken();

  if (notificationsContainer.classList.contains("ready")) {
    notificationsContainer.classList.remove("ready");
    notificationsContainer.innerHTML = "";
  }
  const existingNotificationIds = new Set(
    Array.from(notificationsContainer.querySelectorAll(".issue-element-inner")).map((element) => element.getAttribute("data-issue-id"))
  );

  let delay = 0;
  const baseDelay = 1000 / 15; // Base delay in milliseconds

  // Fetch all latest comments before rendering notifications
  const commentsMap = await fetchLatestComments(notifications);

  for (const notification of notifications) {
    if (!existingNotificationIds.has(notification.notification.id.toString())) {
      const issueWrapper = everyNewNotification({ notification, notificationsContainer, commentsMap, providerToken});

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
  
  // Check if notificationsContainer has no children and render empty message if true
  if (notificationsContainer.children.length === 0) {
    renderEmpty();
  }

  // Scroll to the top of the page
  window.scrollTo({ top: 0 });
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

function everyNewNotification({
  notification,
  notificationsContainer,
  commentsMap,
  providerToken
}: {
  notification: GitHubAggregated;
  notificationsContainer: HTMLDivElement;
  commentsMap: Map<string, { userType: string, url: string; avatarUrl: string; commentBody: string }>;
  providerToken: string | null;
}) {
  const issueWrapper = notificationTemplate.cloneNode(true) as HTMLDivElement;
  const issueElement = issueWrapper.querySelector(".issue-element-inner") as HTMLDivElement;

  issueElement.setAttribute("data-issue-id", notification.notification.id.toString());
  issueElement.classList.add("issue-element-inner");

  const labels = parseAndGenerateLabels(notification);
  const [organizationName, repositoryName] = notification.notification.repository.url.split("/").slice(-2);

  const commentData = commentsMap.get(notification.notification.id.toString());

  if ((!commentData || commentData.commentBody === "") || (commentData.userType === "Bot" && !showBotNotifications)) return;

  setUpIssueElement(providerToken, issueElement, notification, organizationName, repositoryName, labels, commentData);
  issueWrapper.appendChild(issueElement);
  notificationsContainer.appendChild(issueWrapper);
  return issueWrapper;
}

function setUpIssueElement(
  providerToken: string | null,
  issueElement: HTMLDivElement,
  notification: GitHubAggregated,
  organizationName: string,
  repositoryName: string,
  labels: string[],
  commentData: { userType: string, url: string; avatarUrl: string; commentBody: string }
) {
  if(commentData.userType === "Bot" && !showBotNotifications) {
    console.log("bot notifications are hidden");
    issueElement.style.display = "none";
  }

  const octokit = new Octokit({ auth: providerToken });
  const image = `<img class="orgAvatar"/>`;

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
    <div class="latest-comment-preview">
        <div class="comment-preview">
          <img src="${commentData.avatarUrl}" class="comment-avatar"/>
          <span class="comment-body">${commentData.commentBody}</span>
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

    issueElement.addEventListener("click", async() => {
      window.open(commentData.url, "_blank");
      try{
        await octokit.request('PATCH /notifications/threads/{thread_id}', {
          thread_id: Number(notification.notification.id),
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        })
        await octokit.request('DELETE /notifications/threads/{thread_id}', {
          thread_id: Number(notification.notification.id),
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        })
      } catch (error){
        console.error("Failed to delete notification:", error);
      }
    });
}

async function fetchLatestComments(notifications: GitHubAggregated[]) {
  const providerToken = await getGitHubAccessToken();
  const commentsMap = new Map<string, { userType: string, url: string; avatarUrl: string; commentBody: string }>();

  await Promise.all(
    notifications.map(async (notification) => {
      const { subject } = notification.notification;
      let userType = "";
      let url = "";
      let avatarUrl = "";
      let commentBody = "";

      if (subject.latest_comment_url) {
        try {
          const response = await fetch(subject.latest_comment_url, {
            headers: { Authorization: `Bearer ${providerToken}` }
          });
          const data = await response.json();
          userType = data.user.type;
          url = data.html_url;
          avatarUrl = data.user.avatar_url;
          commentBody = data.body;

          // Check if commentBody contains HTML
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

      commentsMap.set(notification.notification.id.toString(), { userType, url, avatarUrl, commentBody });
    })
  );

  return commentsMap;
}

function parseAndGenerateLabels(notification: GitHubAggregated) {
  const labels: string[] = [];

  if (notification.issue.labels) {
    notification.issue.labels.forEach((label) => {
      if (typeof label === "string") return;
      if (!label.name) return;

      const match = label.name.match(/^(Priority): /);
      if (match) {
        const name = label.name.replace(match[0], "");
        labels.push(`<label class="priority">${name}</label>`);
      }
    });
  }

  if (notification.notification.reason) {
    const reason = notification.notification.reason.replace(/_/g, " ");
    labels.push(`<label class="reason">${reason}</label>`);
  }

  if (notification.notification.updated_at) {
    const timeAgo = getTimeAgo(new Date(notification.notification.updated_at));
    labels.push(`<label class="timestamp">${timeAgo}</label>`);
  }

  return labels;
}

export function applyAvatarsToNotifications() {
  const notificationsContainer = document.getElementById("issues-container") as HTMLDivElement;
  const notificationElements = Array.from(notificationsContainer.querySelectorAll(".issue-element-inner"));

  notificationElements.forEach((issueElement) => {
    const orgName = issueElement.querySelector(".organization-name")?.textContent;
    if (orgName) {
      const avatarUrl = organizationImageCache.get(orgName);
      if (avatarUrl) {
        const avatarImg = issueElement.querySelector(".orgAvatar") as HTMLImageElement;
        if (avatarImg) {
          avatarImg.src = URL.createObjectURL(avatarUrl);
        }
      }
    }
  });
}
