import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";
import { getGitHubAccessToken } from "../getters/get-github-access-token";
import { GitHubAggregated, GitHubIssue, GitHubLabel, GitHubNotification, GitHubNotifications, GitHubPullRequest } from "../github-types";
import { handleRateLimit } from "./handle-rate-limit";
import { saveNotificationsToCache, saveAggregatedNotificationsToCache } from "../getters/get-indexed-db";

export const organizationImageCache = new Map<string, Blob | null>(); // this should be declared in image related script

// Generalized function to fetch notifications from GitHub
async function fetchNotifications(): Promise<GitHubNotifications | null> {
  const providerToken = await getGitHubAccessToken();
  const octokit = new Octokit({ auth: providerToken });

  try {
    const notifications = (
      await octokit.request("GET /notifications", {
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
        all: false, // Only get unread notifications
        participating: false, // include all unread, not just participating
      })
    ).data as GitHubNotifications;
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
  try {
    // BREAKING CHANGE: endpoint switched from 'devpool-issues.json' to 'partner-open-issues.json'
    // Reason: aligns with new partner-based data model and naming.
    const response = await fetch("https://raw.githubusercontent.com/ubiquity/devpool-directory/__STORAGE__/partner-open-issues.json");
    if (!response.ok) {
      console.warn("Failed to fetch issues:", response.status, response.statusText);
      return [];
    }
    const jsonData: GitHubIssue[] = await response.json();
    return jsonData;
  } catch (error) {
    console.warn("Error fetching issues:", error);
    return [];
  }
}

export async function fetchPullRequests(): Promise<GitHubPullRequest[]> {
  try {
    // BREAKING CHANGE: endpoint switched from 'devpool-pull-requests.json' to 'partner-pull-requests.json'
    // Reason: aligns with new partner-based data model and naming.
    const response = await fetch("https://raw.githubusercontent.com/ubiquity/devpool-directory/__STORAGE__/partner-pull-requests.json");
    if (!response.ok) {
      console.warn("Failed to fetch pull requests:", response.status, response.statusText);
      return [];
    }
    const jsonData: GitHubPullRequest[] = await response.json();
    return jsonData;
  } catch (error) {
    console.warn("Error fetching pull requests:", error);
    return [];
  }
}

function preFilterNotifications(devpoolRepos: Set<string>, notifications: GitHubNotification[]): GitHubNotifications {
  const isAllowAllRepos = devpoolRepos.size === 0; // fallback when directory data fails to load
  return notifications.filter((notification) => {
    // Ignore notifications from repos that are not in devpoolRepos (unless directory data unavailable)
    const repoName = notification.repository.full_name;
    if (!isAllowAllRepos && !devpoolRepos.has(repoName)) {
      console.log("skipping ", notification.subject.title, "cause of repo", repoName);
      return false;
    }
    return isAllowAllRepos || devpoolRepos.has(repoName);
  });
}

// Function to filter pull request notifications
function filterPullRequestNotifications(devpoolRepos: Set<string>, notifications: GitHubNotification[]): GitHubNotifications {
  return preFilterNotifications(devpoolRepos, notifications).filter((notification: GitHubNotification) => notification.subject.type === "PullRequest");
}

// Function to filter issue notifications
function filterIssueNotifications(devpoolRepos: Set<string>, notifications: GitHubNotification[]): GitHubNotifications {
  return preFilterNotifications(devpoolRepos, notifications).filter((notification: GitHubNotification) => notification.subject.type === "Issue");
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
    const pr = aggregated.pullRequest;
    prUrl = pr.url;
    issueNumber = aggregated.issue?.number || null;
    issueUrl = aggregated.issue?.url || null;
    const baseRepoUrl = pr.base?.repo?.url;
    if (baseRepoUrl) {
      [ownerName, repoName] = baseRepoUrl.split("/").slice(-2);
    } else if (aggregated.issue?.repository_url) {
      [ownerName, repoName] = aggregated.issue.repository_url.split("/").slice(-2);
    } else {
      const match = pr.url.match(/repos\/(.+?)\/(.+?)\//);
      if (match) {
        ownerName = match[1];
        repoName = match[2];
      } else {
        return 0; // unable to determine repo context safely
      }
    }
  } else {
    return 0; // unsupported type
  }

  if (!prUrl && !issueUrl) return 0; // safety check

  // regex patterns
  const issueFullUrlRegex = issueUrl ? new RegExp(issueUrl, "g") : null;
  const prFullUrlRegex = prUrl ? new RegExp(prUrl, "g") : null;
  const issueShortRefRegex = issueNumber ? new RegExp(`#${issueNumber}\\b`, "g") : null;

  // check backlinks in a body
  function countMatches(body: string | null, repo: string, owner: string): number {
    let count = 0;
    if (!body) return count;

    if (prFullUrlRegex && body.match(prFullUrlRegex)) count++; // full PR URL match
    if (issueFullUrlRegex && body.match(issueFullUrlRegex)) count++; // full Issue URL match
    if (issueShortRefRegex && body.match(issueShortRefRegex) && repo === repoName && owner === ownerName) {
      count++; // short issue reference match (same repo)
    }

    return count;
  }

  let totalCount = 0;

  // check backlinks in pull requests
  for (const pr of allPullRequests) {
    const baseRepoUrl = pr.base?.repo?.url;
    let prOwner: string | undefined;
    let prRepo: string | undefined;
    if (baseRepoUrl) {
      [prOwner, prRepo] = baseRepoUrl.split("/").slice(-2);
    } else {
      const match = pr.url.match(/repos\/(.+?)\/(.+?)\//);
      if (match) {
        prOwner = match[1];
        prRepo = match[2];
      }
    }
    if (prOwner && prRepo) {
      totalCount += countMatches(pr.body, prRepo, prOwner);
    }
  }

  // check backlinks in issues
  for (const issue of allIssues) {
    const source = getIssueRepositorySource(issue);
    let issueOwner: string | undefined;
    let issueRepo: string | undefined;
    if (source.includes("api.github.com")) {
      const match = source.match(/repos\/([^/]+)\/([^/]+)(?:\/|$)/);
      if (match) {
        issueOwner = match[1];
        issueRepo = match[2];
      }
    } else if (source.includes("github.com")) {
      const match = source.match(/github\.com\/([^/]+)\/([^/]+)(?:\/|$)/);
      if (match) {
        issueOwner = match[1];
        issueRepo = match[2];
      }
    }
    if ((!issueOwner || !issueRepo) && source) {
      const parts = source.split("/").filter(Boolean);
      issueOwner = issueOwner ?? parts[parts.length - 2];
      issueRepo = issueRepo ?? parts[parts.length - 1];
    }
    if (!issueOwner || !issueRepo) continue;
    totalCount += countMatches(issue.body ?? null, issueRepo, issueOwner);
  }

  return totalCount;
}

function getDevpoolRepos(pullRequests: GitHubPullRequest[], issues: GitHubIssue[]): Set<string> {
  const uniqueNames = new Set<string>();

  for (const pullRequest of pullRequests) {
    const baseRepoUrl = pullRequest.base?.repo?.url;
    if (baseRepoUrl) {
      const [ownerName, repoName] = baseRepoUrl.split("/").slice(-2);
      uniqueNames.add(`${ownerName}/${repoName}`);
    } else {
      const match = pullRequest.url.match(/repos\/(.+?)\/(.+?)\//);
      if (match) {
        uniqueNames.add(`${match[1]}/${match[2]}`);
      }
    }
  }

  for (const issue of issues) {
    const source = getIssueRepositorySource(issue);
    let issueOwner: string | undefined;
    let issueRepo: string | undefined;
    if (source.includes("api.github.com")) {
      const match = source.match(/repos\/([^/]+)\/([^/]+)(?:\/|$)/);
      if (match) {
        issueOwner = match[1];
        issueRepo = match[2];
      }
    } else if (source.includes("github.com")) {
      const match = source.match(/github\.com\/([^/]+)\/([^/]+)(?:\/|$)/);
      if (match) {
        issueOwner = match[1];
        issueRepo = match[2];
      }
    }
    if ((!issueOwner || !issueRepo) && source) {
      const parts = source.split("/").filter(Boolean);
      issueOwner = issueOwner ?? parts[parts.length - 2];
      issueRepo = issueRepo ?? parts[parts.length - 1];
    }
    if (issueOwner && issueRepo) uniqueNames.add(`${issueOwner}/${issueRepo}`);
  }
  return uniqueNames;
}

// Helper: best-effort extraction of repository URL-ish source from an issue
function getIssueRepositorySource(issue: GitHubIssue): string {
  // Prefer API repository URL when available, then html_url, then url
  const urls = issue as unknown as { repository_url?: string; html_url?: string; url?: string };
  return urls.repository_url ?? urls.html_url ?? urls.url ?? "";
}

// Process notifications into aggregated data
export async function processNotifications(
  notifications: GitHubNotifications,
  pullRequests: GitHubPullRequest[],
  issues: GitHubIssue[]
): Promise<GitHubAggregated[] | null> {
  const devpoolRepos = getDevpoolRepos(pullRequests, issues);
  console.log("devpoolRepos: ", devpoolRepos);

  const [pullRequestNotifications, issueNotifications] = await Promise.all([
    getPullRequestNotifications(devpoolRepos, notifications, pullRequests, issues),
    getIssueNotifications(devpoolRepos, notifications, issues),
  ]);

  if (!pullRequestNotifications && !issueNotifications) return null;

  const allNotifications = [...(pullRequestNotifications || []), ...(issueNotifications || [])];

  // filter notifs with priority label (case-insensitive, allow flexible spacing) from issue or PR labels
  const priorityNotifications = allNotifications.filter((aggregated) => {
    const labelSource = aggregated.issue?.labels || aggregated.pullRequest?.labels;
    if (!labelSource) return false;

    const hasPriority = labelSource.some((label: GitHubLabel) => {
      if (typeof label === "string") return /priority\s*:\s*/i.test(label);
      if (!label?.name) return false;
      return /priority\s*:\s*/i.test(label.name);
    });

    if (!hasPriority) {
      console.log("skipping ", aggregated.notification.subject.title, "cause no priority label");
    }
    return hasPriority;
  });

  // If none carry a priority label, fall back to all so the UI is not empty
  const filteredNotifications = priorityNotifications.length > 0 ? priorityNotifications : allNotifications;
  if (priorityNotifications.length === 0) {
    console.log("no priority labels found; showing all notifications as fallback");
  }

  for (const aggregated of filteredNotifications) {
    // count backlinks
    const backlinkCount = countBacklinks(aggregated, pullRequests, issues);
    aggregated.backlinkCount = backlinkCount;
  }

  console.log("filteredNotifications", filteredNotifications);
  return filteredNotifications;
}

// Fetch all notifications and return them as an array of aggregated data
export async function fetchAllNotifications(): Promise<GitHubAggregated[] | null> {
  // fetches all notifications, pull requests and issues in parallel
  const [notifications, pullRequests, issues] = await Promise.all([fetchNotifications(), fetchPullRequests(), fetchIssues()]);
  if (!notifications || !pullRequests || !issues) return null;

  const aggregated = await processNotifications(notifications, pullRequests, issues);
  // Save fetched notifications and aggregated view to IndexedDB cache
  await Promise.all([saveNotificationsToCache(notifications), saveAggregatedNotificationsToCache(aggregated ?? [])]);

  return aggregated;
}
