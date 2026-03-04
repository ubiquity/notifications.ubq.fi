import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";
import { getGitHubAccessToken } from "../getters/get-github-access-token";
import { resolveViewerLogin } from "../getters/get-viewer-login";
import { GitHubAggregated, GitHubIssue, GitHubLabel, GitHubNotification, GitHubNotifications, GitHubPullRequest } from "../github-types";
import { handleRateLimit } from "./handle-rate-limit";
import { saveNotificationsToCache, saveAggregatedNotificationsToCache } from "../getters/get-indexed-db";
import { handleAuthFailure } from "../auth/handle-auth-failure";

export const organizationImageCache = new Map<string, Blob | null>(); // this should be declared in image related script

// Generalized function to fetch notifications from GitHub
export async function fetchNotifications(options: { token?: string } = {}): Promise<GitHubNotifications | null> {
  const providerToken = options.token ?? (await getGitHubAccessToken());
  if (!providerToken) {
    console.warn("No GitHub access token available");
    return null;
  }
  const octokit = new Octokit({ auth: providerToken });

  try {
    const notifications = (
      await octokit.request("GET /notifications", {
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
        // Only unread (default) so marked-as-read items drop from the list after refresh
        participating: true,
      })
    ).data as GitHubNotifications;
    console.log("unfiltered", notifications);
    return notifications;
  } catch (error) {
    if (error instanceof RequestError) {
      const isBadCredentials = error.status === 401 || /bad credentials/i.test(error.message);
      if (error.status === 403 && !isBadCredentials) {
        await handleRateLimit(octokit, error);
      }
      if (isBadCredentials) {
        await handleAuthFailure("GET /notifications");
      }
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

const ISSUE_KEYWORDS_PATTERN = "(Resolves|Closes|Fixes)";
const ISSUE_URL_REGEX = new RegExp(`${ISSUE_KEYWORDS_PATTERN}\\s+(https:\\/\\/github\\.com\\/(.+?)\\/(.+?)\\/issues\\/(\\d+))`, "i");
const ISSUE_NUMBER_REGEX = new RegExp(`${ISSUE_KEYWORDS_PATTERN}\\s+#(\\d+)`, "i");
const ISSUE_MARKDOWN_LINK_REGEX = new RegExp(`${ISSUE_KEYWORDS_PATTERN}\\s+\\[\\s*#(\\d+)\\s*\\]`, "i");

async function fetchIssueFromPullRequest(pullRequest: GitHubPullRequest, issues: GitHubIssue[]): Promise<GitHubIssue | null> {
  if (!pullRequest.body) return null;

  // Match the issue reference in the PR body
  const issueUrlMatch = pullRequest.body.match(ISSUE_URL_REGEX);
  const issueNumberMatch = pullRequest.body.match(ISSUE_NUMBER_REGEX);
  const issueMarkdownLinkMatch = pullRequest.body.match(ISSUE_MARKDOWN_LINK_REGEX);

  let apiUrl: string;

  if (issueUrlMatch) {
    // Full URL to the issue is provided
    const [, , owner, repo, issueNumber] = issueUrlMatch;
    apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
  } else if (issueNumberMatch || issueMarkdownLinkMatch) {
    // Only issue number is provided, construct API URL using current repo info
    const issueNumber = issueNumberMatch ? issueNumberMatch[2] : issueMarkdownLinkMatch ? issueMarkdownLinkMatch[2] : null;
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

async function fetchIssueByApi(issueUrl: string, token: string): Promise<GitHubIssue | null> {
  try {
    const response = await fetch(issueUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      console.warn("Failed to fetch issue via API", issueUrl, response.status);
      return null;
    }
    const data = (await response.json()) as GitHubIssue;
    return data;
  } catch (error) {
    console.warn("Error fetching issue via API", issueUrl, error);
    return null;
  }
}

// Function to fetch pull request notifications with related pull request and issue data
export async function getPullRequestNotifications(
  devpoolRepos: Set<string>,
  notifications: GitHubNotification[],
  pullRequests: GitHubPullRequest[],
  issues: GitHubIssue[],
  token: string
): Promise<GitHubAggregated[] | null> {
  if (!notifications) return null;

  const filteredNotifications = filterPullRequestNotifications(devpoolRepos, notifications);
  if (filteredNotifications.length === 0) return [];

  const octokit = new Octokit({ auth: token });

  const aggregatedData = await Promise.all(
    filteredNotifications.map(async (notification) => {
      const pullRequestUrl = notification.subject.url;
      let pullRequest = pullRequests.find((pr) => pr.url === pullRequestUrl) ?? null;
      if (!pullRequest) {
        try {
          pullRequest = (
            await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
              owner: notification.repository.owner.login,
              repo: notification.repository.name,
              pull_number: Number(notification.subject.url.split("/").pop()),
              headers: { "X-GitHub-Api-Version": "2022-11-28" },
            })
          ).data as unknown as GitHubPullRequest;
        } catch (error) {
          console.log("skipping ", notification.subject.title, "cause PR not found in API", error);
          return null;
        }
      }

      const issue = await fetchIssueFromPullRequest(pullRequest, issues);
      let resolvedIssue = issue;
      if (!resolvedIssue) {
        const baseRepoUrl = pullRequest.base?.repo?.url;
        if (baseRepoUrl && pullRequest.number) {
          const fallbackIssueUrl = `${baseRepoUrl}/issues/${pullRequest.number}`;
          resolvedIssue = await fetchIssueByApi(fallbackIssueUrl, token);
        }
      }
      if (!resolvedIssue) {
        console.log("skipping ", notification.subject.title, "cause no associated issue");
        return null; // Skip if no associated issue
      }

      return { notification, pullRequest, issue: resolvedIssue, backlinkCount: 0 } as GitHubAggregated;
    })
  );

  return aggregatedData.filter((item): item is GitHubAggregated => item !== null);
}

// Function to fetch issue notifications with related issue data
export async function getIssueNotifications(
  devpoolRepos: Set<string>,
  notifications: GitHubNotification[],
  issues: GitHubIssue[],
  token: string
): Promise<GitHubAggregated[] | null> {
  if (!notifications) return null;

  const filteredNotifications = filterIssueNotifications(devpoolRepos, notifications);
  if (filteredNotifications.length === 0) return [];

  const aggregatedData = await Promise.all(
    filteredNotifications.map(async (notification) => {
      const issueUrl = notification.subject.url;
      const issue = issues.find((item) => item.url === issueUrl) ?? (await fetchIssueByApi(issueUrl, token));
      if (!issue) {
        console.log("skipping ", notification.subject.title, "cause issue not found in fetched list");
        return null;
      }
      return { notification, pullRequest: null, issue, backlinkCount: 0 } as GitHubAggregated;
    })
  );

  return aggregatedData.filter((item): item is GitHubAggregated => item !== null);
}

function extractOwnerRepo(source: string | null | undefined): { owner?: string; repo?: string } {
  if (!source) return {};
  let owner: string | undefined;
  let repo: string | undefined;

  if (source.includes("api.github.com")) {
    const match = source.match(/repos\/([^/]+)\/([^/]+)(?:\/|$)/);
    if (match) {
      owner = match[1];
      repo = match[2];
    }
  } else if (source.includes("github.com")) {
    const match = source.match(/github\.com\/([^/]+)\/([^/]+)(?:\/|$)/);
    if (match) {
      owner = match[1];
      repo = match[2];
    }
  }

  if ((!owner || !repo) && source) {
    const parts = source.split("/").filter(Boolean);
    if (parts.length >= 2) {
      owner = owner ?? parts[parts.length - 2];
      repo = repo ?? parts[parts.length - 1];
    }
  }

  return { owner, repo };
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
    const { owner: prOwner, repo: prRepo } = extractOwnerRepo(pr.base?.repo?.url ?? pr.url);
    if (prOwner && prRepo) {
      totalCount += countMatches(pr.body, prRepo, prOwner);
    }
  }

  // check backlinks in issues
  for (const issue of allIssues) {
    const { owner: issueOwner, repo: issueRepo } = extractOwnerRepo(getIssueRepositorySource(issue));
    if (!issueOwner || !issueRepo) continue;
    totalCount += countMatches(issue.body ?? null, issueRepo, issueOwner);
  }

  return totalCount;
}

function getDevpoolRepos(pullRequests: GitHubPullRequest[], issues: GitHubIssue[]): Set<string> {
  const uniqueNames = new Set<string>();

  for (const pullRequest of pullRequests) {
    const { owner, repo } = extractOwnerRepo(pullRequest.base?.repo?.url ?? pullRequest.url);
    if (owner && repo) {
      uniqueNames.add(`${owner}/${repo}`);
    }
  }

  for (const issue of issues) {
    const { owner, repo } = extractOwnerRepo(getIssueRepositorySource(issue));
    if (owner && repo) uniqueNames.add(`${owner}/${repo}`);
  }
  return uniqueNames;
}

// Helper: best-effort extraction of repository URL-ish source from an issue
function getIssueRepositorySource(issue: GitHubIssue): string {
  // Prefer API repository URL when available, then html_url, then url
  const urls = issue as unknown as { repository_url?: string; html_url?: string; url?: string };
  return urls.repository_url ?? urls.html_url ?? urls.url ?? "";
}

async function filterOwnLatestCommentNotifications(aggregated: GitHubAggregated[], token: string): Promise<GitHubAggregated[]> {
  const viewerLogin = await resolveViewerLogin(token);
  if (!viewerLogin) return aggregated;

  const results = await Promise.all(
    aggregated.map(async (item) => {
      const latestUrl = item.notification.subject.latest_comment_url;
      if (!latestUrl) return item;
      try {
        const response = await fetch(latestUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        if (!response.ok) {
          if (response.status === 401) {
            await handleAuthFailure("latest comment fetch");
          }
          console.warn("Latest comment fetch failed", latestUrl, response.status);
          return item;
        }
        const data: { user?: { login?: string } } = await response.json();
        const authorLogin = data.user?.login ? data.user.login.toLowerCase() : "";
        if (authorLogin && authorLogin === viewerLogin) {
          console.log("skipping ", item.notification.subject.title, "because latest comment is by current user");
          return null;
        }
      } catch (error) {
        console.warn("Failed to fetch latest comment", latestUrl, error);
      }
      return item;
    })
  );

  return results.filter((item): item is GitHubAggregated => item !== null);
}

// Process notifications into aggregated data
export async function processNotifications(
  notifications: GitHubNotifications,
  pullRequests: GitHubPullRequest[],
  issues: GitHubIssue[],
  token?: string
): Promise<GitHubAggregated[] | null> {
  const providerToken = token ?? (await getGitHubAccessToken());
  if (!providerToken) {
    console.warn("No GitHub access token available for processing notifications");
    return null;
  }
  const devpoolRepos = getDevpoolRepos(pullRequests, issues);
  console.log("devpoolRepos: ", devpoolRepos);

  const [pullRequestNotifications, issueNotifications] = await Promise.all([
    getPullRequestNotifications(devpoolRepos, notifications, pullRequests, issues, providerToken),
    getIssueNotifications(devpoolRepos, notifications, issues, providerToken),
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

  // UX: If none carry a priority label, fall back to all so the UI is not empty (partner feeds sometimes omit labels)
  const filteredNotifications = priorityNotifications.length > 0 ? priorityNotifications : allNotifications;
  if (priorityNotifications.length === 0) {
    console.log("no priority labels found; showing all notifications as fallback");
  }

  const withoutOwnComments = providerToken ? await filterOwnLatestCommentNotifications(filteredNotifications, providerToken) : filteredNotifications;

  for (const aggregated of withoutOwnComments) {
    // count backlinks
    const backlinkCount = countBacklinks(aggregated, pullRequests, issues);
    aggregated.backlinkCount = backlinkCount;
  }

  console.log("filteredNotifications", withoutOwnComments);
  return withoutOwnComments;
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
