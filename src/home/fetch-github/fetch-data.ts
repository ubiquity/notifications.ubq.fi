import { Octokit } from "@octokit/rest";
import { GitHubAggregated, GitHubIssue, GitHubNotification, GitHubNotifications, GitHubPullRequest } from "../github-types";
import { getGitHubAccessToken } from "../getters/get-github-access-token";
import { handleRateLimit } from "./handle-rate-limit";
import { RequestError } from "@octokit/request-error";

export const organizationImageCache = new Map<string, Blob | null>(); // this should be declared in image related script

// Generalized function to fetch notifications from GitHub
async function fetchNotifications(): Promise<GitHubNotifications | null> {
  const providerToken = await getGitHubAccessToken();
  const octokit = new Octokit({ auth: providerToken });

  try {
    const notifications = (await octokit.request("GET /notifications")).data as GitHubNotifications;
    console.log("unfiltered", notifications);
    return notifications;
  } catch (error) {
    if (error instanceof RequestError && error.status === 403) {
      await handleRateLimit(octokit, error);
    }
    console.warn("Error fetching notifications:", error);
  }
  return null;
}

export async function fetchIssues(): Promise<GitHubIssue[]> {
    const response = await fetch("https://raw.githubusercontent.com/ubiquity/devpool-directory/__STORAGE__/devpool-issues.json");
    const jsonData = await response.json();
    return jsonData;
  }

export async function fetchPullRequests(): Promise<GitHubPullRequest[]> {
    const response = await fetch("https://raw.githubusercontent.com/ubiquity/devpool-directory/__STORAGE__/devpool-pull-requests.json");
    const jsonData = await response.json();
    return jsonData;
}

// Pre-filter notifications by general rules (repo filtering and ignoring CI activity)
function preFilterNotifications(notifications: GitHubNotification[]): GitHubNotifications {
  return notifications.filter((notification) => {
    // Ignore based on reason
    if (
      ["comment", "ci_activity", "invitation", "member_feature_requested", "security_advisory_credit", "state_change", "team_mention"].includes(
        notification.reason
      )
    ) {
      return false;
    }

    // Ignore notifications from orgs that are not relevant
    const repoName = notification.repository.full_name.split("/")[0];
    return ["ubiquity", "ubiquity-os", "ubiquity-os-marketplace"].includes(repoName);
  });
}

// Function to filter pull request notifications
function filterPullRequestNotifications(notifications: GitHubNotification[]): GitHubNotifications {
  return preFilterNotifications(notifications).filter((notification) => notification.subject.type === "PullRequest");
}

// Function to filter issue notifications
function filterIssueNotifications(notifications: GitHubNotification[]): GitHubNotifications {
  return preFilterNotifications(notifications).filter((notification) => notification.subject.type === "Issue");
}

async function fetchIssueFromPullRequest(pullRequest: GitHubPullRequest): Promise<GitHubIssue | null> {
  const issues = await fetchIssues();
  if (!pullRequest.body) return null;

  // Match the issue reference in the PR body
  const issueUrlMatch = pullRequest.body.match(/Resolves (https:\/\/github\.com\/(.+?)\/(.+?)\/issues\/(\d+))/);
  const issueNumberMatch = pullRequest.body.match(/Resolves #(\d+)/);
  const issueMarkdownLinkMatch = pullRequest.body.match(/Resolves \[\s*#(\d+)\s*\]/);

  let apiUrl: string;

  if (issueUrlMatch) {
    // Full URL to the issue is provided
    const [, , owner, repo, issueNumber] = issueUrlMatch;
    apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
  } else if (issueNumberMatch || issueMarkdownLinkMatch) {
    // Only issue number is provided, construct API URL using current repo info
    const issueNumber = issueNumberMatch ? issueNumberMatch[1] : issueMarkdownLinkMatch ? issueMarkdownLinkMatch[1] : null;
    if (!issueNumber) return null;
    const pullRequestUrlMatch = pullRequest.url.match(/repos\/(.+?)\/(.+?)\/pulls\/\d+/);
    if (!pullRequestUrlMatch) return null;

    const [, owner, repo] = pullRequestUrlMatch;
    apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
  } else {
    // No valid issue reference found
    return null;
  }

   const issue = issues.find((issue) => issue.url === apiUrl);
   return issue || null;
}

// Function to fetch pull request notifications with related pull request and issue data
export async function fetchPullRequestNotifications(): Promise<GitHubAggregated[] | null> {
  const notifications = await fetchNotifications();
  const pullRequests = await fetchPullRequests();
  if (!notifications) return null;

  const aggregatedData: GitHubAggregated[] = [];
  const filteredNotifications = filterPullRequestNotifications(notifications);

  for (const notification of filteredNotifications) {
    const pullRequestUrl = notification.subject.url;
    const pullRequest = pullRequests.find((pr) => pr.url === pullRequestUrl);
    if (!pullRequest  || pullRequest.draft || pullRequest.state === "closed") {
      console.log("Pull request is draft or closed", pullRequest);
      continue; // Skip draft or closed pull requests
    }

    const issue = await fetchIssueFromPullRequest(pullRequest);
    if (!issue) {
      console.log("No associated issue", pullRequest);
      continue; // Skip if no associated issue
    }

    aggregatedData.push({ notification, pullRequest, issue });
  }

  console.log("pullRequestNotifications", aggregatedData);
  return aggregatedData;
}

// Function to fetch issue notifications with related issue data
export async function fetchIssueNotifications(): Promise<GitHubAggregated[] | null> {
  const notifications = await fetchNotifications();
  const issues = await fetchIssues();
  if (!notifications) return null;

  const aggregatedData: GitHubAggregated[] = [];
  const filteredNotifications = filterIssueNotifications(notifications);

  for (const notification of filteredNotifications) {
    const issueUrl = notification.subject.url;
    const issue = issues.find((issue) => issue.url === issueUrl);
    if (!issue || issue.state === "closed") {
      console.log("Issue is closed", issue);
      continue; // Skip closed issues
    }

    aggregatedData.push({ notification, pullRequest: null, issue });
  }

  console.log("issueNotifications", aggregatedData);
  return aggregatedData;
}

// Fetch all notifications and return them as an array of aggregated data
export async function fetchAllNotifications(): Promise<GitHubAggregated[] | null> {
  const pullRequestNotifications = await fetchPullRequestNotifications();
  const issueNotifications = await fetchIssueNotifications();

  if (!pullRequestNotifications && !issueNotifications) return null;
  if (!pullRequestNotifications) return issueNotifications;
  if (!issueNotifications) return pullRequestNotifications;

  const allNotifications = [...pullRequestNotifications, ...issueNotifications];
  console.log("allNotifications", allNotifications);
  return allNotifications;
}
