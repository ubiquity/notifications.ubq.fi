import { Octokit } from "@octokit/rest";
import { GitHubAggregated, GitHubIssue, GitHubNotification, GitHubNotifications, GitHubPullRequest } from "../github-types";
import { getGitHubAccessToken } from "../getters/get-github-access-token";
import { handleRateLimit } from "./handle-rate-limit";
import { RequestError } from "@octokit/request-error";

// Generalized function to fetch notifications from GitHub
async function fetchNotifications(): Promise<GitHubNotifications | null> {
  const providerToken = await getGitHubAccessToken();
  const octokit = new Octokit({ auth: providerToken });

  try {
    const notifications = (await octokit.request("GET /notifications")).data as GitHubNotifications;
    return notifications;
  } catch (error) {
    if (error instanceof RequestError && error.status === 403) {
      await handleRateLimit(octokit, error);
    }
    console.warn("Error fetching notifications:", error);
  }
  return null;
}

// Pre-filter notifications by general rules (repo filtering and ignoring CI activity)
function preFilterNotifications(notifications: GitHubNotification[]): GitHubNotifications {
  return notifications.filter((notification) => {
    // Ignore based on reason
    if (
      ["author", "comment", "ci_activity", "invitation", "member_feature_requested", "security_advisory_credit", "state_change", "team_mention"].includes(
        notification.reason
      )
    ) {
      return false;
    }

    // Ignore notifications from repos that are not relevant
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

// Function to fetch the pull request details
async function fetchPullRequestDetails(pullRequestUrl: string): Promise<GitHubPullRequest | null> {
  const providerToken = await getGitHubAccessToken();
  const octokit = new Octokit({ auth: providerToken });

  try {
    const pullRequest = (await octokit.request(`GET ${pullRequestUrl}`)).data as GitHubPullRequest;
    return pullRequest;
  } catch (error) {
    console.warn("Error fetching pull request:", error);
  }
  return null;
}

// Function to fetch the issue details
async function fetchIssueDetails(issueUrl: string): Promise<GitHubIssue | null> {
  const providerToken = await getGitHubAccessToken();
  const octokit = new Octokit({ auth: providerToken });

  try {
    const issue = (await octokit.request(`GET ${issueUrl}`)).data as GitHubIssue;
    return issue;
  } catch (error) {
    console.warn("Error fetching issue:", error);
  }
  return null;
}

// Function to fetch the issue associated with a pull request
async function fetchIssueFromPullRequest(pullRequest: GitHubPullRequest): Promise<GitHubIssue | null> {
  const providerToken = await getGitHubAccessToken();
  const octokit = new Octokit({ auth: providerToken });

  // Extract issue number from PR body
  const issueNumberMatch = pullRequest.body?.match(/Resolves .*\/issues\/(\d+)/) || pullRequest.body?.match(/Resolves #(\d+)/);
  if (!issueNumberMatch) return null;

  const issueNumber = issueNumberMatch[1];
  const issueUrl = pullRequest.issue_url.replace(/issues\/\d+$/, `issues/${issueNumber}`);
  try {
    const issue = (await octokit.request(`GET ${issueUrl}`)).data as GitHubIssue;
    return issue;
  } catch (error) {
    console.warn("Error fetching issue:", error);
  }
  return null;
}

// Main function to fetch pull request notifications with related pull request and issue data
export async function fetchPullRequestNotifications(): Promise<GitHubAggregated[] | null> {
  const notifications = await fetchNotifications();
  if (!notifications) return null;

  const aggregatedData: GitHubAggregated[] = [];
  const filteredNotifications = filterPullRequestNotifications(notifications);

  for (const notification of filteredNotifications) {
    const pullRequestUrl = notification.subject.url;
    const pullRequest = await fetchPullRequestDetails(pullRequestUrl);
    if (!pullRequest || pullRequest.draft || pullRequest.state === "closed") {
      continue; // Skip draft or closed pull requests
    }

    const issue = await fetchIssueFromPullRequest(pullRequest);
    if (!issue) continue; // Skip if no associated issue

    aggregatedData.push({ notification, pullRequest, issue });
  }

  console.log("pullRequestNotifications", aggregatedData);
  return aggregatedData;
}

// Main function to fetch issue notifications with related issue data
export async function fetchIssueNotifications(): Promise<GitHubAggregated[] | null> {
  const notifications = await fetchNotifications();
  if (!notifications) return null;

  const aggregatedData: GitHubAggregated[] = [];
  const filteredNotifications = filterIssueNotifications(notifications);

  for (const notification of filteredNotifications) {
    const issueUrl = notification.subject.url;
    const issue = await fetchIssueDetails(issueUrl);
    if (!issue || issue.state === "closed") {
      continue; // Skip closed issues
    }

    aggregatedData.push({ notification, pullRequest: null, issue });
  }

  console.log("issueNotifications", aggregatedData);
  return aggregatedData;
}