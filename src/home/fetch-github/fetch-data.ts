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
    console.warn("error fetching notifications:", error);
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
function preFilterNotifications(devpoolRepos: Set<string>, notifications: GitHubNotification[]): GitHubNotifications {
  return notifications.filter((notification) => {
    // Ignore based on reason
    if (
      ["comment", "ci_activity", "invitation", "member_feature_requested", "security_advisory_credit", "state_change", "team_mention"].includes(
        notification.reason
      )
    ) {
      console.log("skipping ", notification.subject.title, "cause of reason", notification.reason);
      return false;
    }

    // Ignore notifications from repos that are not in devpoolRepos
    const repoName = notification.repository.full_name;
    if (!devpoolRepos.has(repoName)) {
      console.log("skipping ", notification.subject.title, "cause of repo", repoName);
      return false;
    }
    return devpoolRepos.has(repoName);
  });
}

// Function to filter pull request notifications
function filterPullRequestNotifications(devpoolRepos: Set<string>, notifications: GitHubNotification[]): GitHubNotifications {
  return preFilterNotifications(devpoolRepos, notifications).filter((notification) => notification.subject.type === "PullRequest");
}

// Function to filter issue notifications
function filterIssueNotifications(devpoolRepos: Set<string>, notifications: GitHubNotification[]): GitHubNotifications {
  return preFilterNotifications(devpoolRepos, notifications).filter((notification) => notification.subject.type === "Issue");
}

async function fetchIssueFromPullRequest(pullRequest: GitHubPullRequest, issues: GitHubIssue[]): Promise<GitHubIssue | null> {
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
export async function getPullRequestNotifications(
  devpoolRepos: Set<string>,
  notifications: GitHubNotification[],
  pullRequests: GitHubPullRequest[],
  issues: GitHubIssue[]
): Promise<GitHubAggregated[] | null> {
  if (!notifications) return null;

  const aggregatedData: GitHubAggregated[] = [];
  const filteredNotifications = filterPullRequestNotifications(devpoolRepos, notifications);

  for (const notification of filteredNotifications) {
    const pullRequestUrl = notification.subject.url;
    const pullRequest = pullRequests.find((pr) => pr.url === pullRequestUrl);
    if (!pullRequest || pullRequest.draft || pullRequest.state === "closed") {
      console.log("skipping ", notification.subject.title, "cause draft or closed");
      continue; // Skip draft or closed pull requests
    }

    const issue = await fetchIssueFromPullRequest(pullRequest, issues);
    if (!issue) {
      console.log("skipping ", notification.subject.title, "cause no associated issue");
      continue; // Skip if no associated issue
    }

    aggregatedData.push({ notification, pullRequest, issue, backlinkCount: 0 });
  }

  return aggregatedData;
}

// Function to fetch issue notifications with related issue data
export function getIssueNotifications(devpoolRepos: Set<string>, notifications: GitHubNotification[], issues: GitHubIssue[]): GitHubAggregated[] | null {
  if (!notifications) return null;

  const aggregatedData: GitHubAggregated[] = [];
  const filteredNotifications = filterIssueNotifications(devpoolRepos, notifications);

  for (const notification of filteredNotifications) {
    const issueUrl = notification.subject.url;
    const issue = issues.find((issue) => issue.url === issueUrl);
    if (!issue || issue.state === "closed") {
      console.log("skipping ", notification.subject.title, "cause issue is closed");
      continue; // Skip closed issues
    }

    aggregatedData.push({ notification, pullRequest: null, issue, backlinkCount: 0 });
  }

  return aggregatedData;
}

function countBacklinks(aggregated: GitHubAggregated, allPullRequests: GitHubPullRequest[], allIssues: GitHubIssue[]): number {
  let issueNumber: number | null = null;
  let issueUrl: string | null = null;
  let prUrl: string | null = null;
  let repoName: string, ownerName: string;

  // extract URLs and numbers based on the notification type
  if (aggregated.notification.subject.type === "Issue" && aggregated.issue) {
    const { number, url, repository_url } = aggregated.issue;
    issueNumber = number;
    issueUrl = url;
    [ownerName, repoName] = repository_url.split("/").slice(-2);
  } else if (aggregated.notification.subject.type === "PullRequest" && aggregated.pullRequest) {
    const { url, base } = aggregated.pullRequest;
    prUrl = url;
    issueNumber = aggregated.issue?.number || null;
    issueUrl = aggregated.issue?.url || null;
    [ownerName, repoName] = base.repo.url.split("/").slice(-2);
  } else {
    return 0; // unsupported type
  }

  if (!prUrl && !issueUrl) return 0; // safety check

  // regex patterns
  const issueFullUrlRegex = issueUrl ? new RegExp(issueUrl, "g") : null;
  const prFullUrlRegex = prUrl ? new RegExp(prUrl, "g") : null;
  const issueShortRefRegex = issueNumber ? new RegExp(`#${issueNumber}\\b`, "g") : null;

  // check backlinks in a body
  const countMatches = (body: string | null, repo: string, owner: string): number => {
    let count = 0;
    if (!body) return count;

    if (prFullUrlRegex && body.match(prFullUrlRegex)) count++; // full PR URL match
    if (issueFullUrlRegex && body.match(issueFullUrlRegex)) count++; // full Issue URL match
    if (issueShortRefRegex && body.match(issueShortRefRegex) && repo === repoName && owner === ownerName) {
      count++; // short issue reference match (same repo)
    }

    return count;
  };

  let totalCount = 0;

  // check backlinks in pull requests
  for (const pr of allPullRequests) {
    const [prOwner, prRepo] = pr.base.repo.url.split("/").slice(-2);
    totalCount += countMatches(pr.body, prRepo, prOwner);
  }

  // check backlinks in issues
  for (const issue of allIssues) {
    const [issueOwner, issueRepo] = issue.repository_url.split("/").slice(-2);
    totalCount += countMatches(issue.body ?? null, issueRepo, issueOwner);
  }

  return totalCount;
}

function getDevpoolRepos(pullRequests: GitHubPullRequest[], issues: GitHubIssue[]): Set<string> {
  const uniqueNames = new Set<string>();

  for (const pullRequest of pullRequests) {
    const [ownerName, repoName] = pullRequest.base.repo.url.split("/").slice(-2);
    uniqueNames.add(`${ownerName}/${repoName}`);
  }

  for (const issue of issues) {
    const [issueOwner, issueRepo] = issue.repository_url.split("/").slice(-2);
    uniqueNames.add(`${issueOwner}/${issueRepo}`);
  }
  return uniqueNames;
}

// Fetch all notifications and return them as an array of aggregated data
export async function fetchAllNotifications(): Promise<GitHubAggregated[] | null> {
  // fetches all notifications, pull requests and issues in parallel
  const [notifications, pullRequests, issues] = await Promise.all([fetchNotifications(), fetchPullRequests(), fetchIssues()]);
  if (!notifications || !pullRequests || !issues) return null;

  const devpoolRepos = getDevpoolRepos(pullRequests, issues);
  console.log("devpoolRepos: ", devpoolRepos);

  const [pullRequestNotifications, issueNotifications] = await Promise.all([
    getPullRequestNotifications(devpoolRepos, notifications, pullRequests, issues),
    getIssueNotifications(devpoolRepos, notifications, issues),
  ]);

  if (!pullRequestNotifications && !issueNotifications) return null;

  const allNotifications = [...(pullRequestNotifications || []), ...(issueNotifications || [])];

  // filter notifs with priority label
  const filteredNotifications = allNotifications.filter((aggregated) => {
    if (!aggregated.issue || !aggregated.issue.labels) {
      // skip if no issue or labels
      console.log("skipping ", aggregated.notification.subject.title, "cause no labels or issue");
      return false;
    }

    const isSuccess = aggregated.issue.labels.some((label) => {
      if (typeof label === "string" || !label.name) {
        return false;
      }

      const match = label.name.match(/^(Priority): /);
      if (match) {
        return true;
      }

      return false;
    });

    if (!isSuccess){
      console.log("skipping ", aggregated.notification.subject.title, "cause no priority label");
    }
    return isSuccess;
  });

  for (const aggregated of filteredNotifications) {
    // count backlinks
    const backlinkCount = countBacklinks(aggregated, pullRequests, issues);
    aggregated.backlinkCount = backlinkCount;
  }

  console.log("filteredNotifications", filteredNotifications);
  return filteredNotifications;
}
