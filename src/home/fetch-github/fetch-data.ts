import { Octokit } from "@octokit/rest";
import { GitHubAggregated, GitHubIssue, GitHubNotification, GitHubNotifications, GitHubPullRequest } from "../github-types";
import { getGitHubAccessToken } from "../getters/get-github-access-token";
import { handleRateLimit } from "./handle-rate-limit";
import { RequestError } from "@octokit/request-error";
export const organizationImageCache = new Map<string, Blob | null>(); // this should be declared in image related script

// Fetches notifications from GitHub, must be authenticated
export async function fetchPullRequestNotifications(): Promise<GitHubAggregated[] | null> {
  const providerToken = await getGitHubAccessToken();
  const octokit = new Octokit({ auth: providerToken });

  const aggregatedData : GitHubAggregated[] = [];

  try {
    const notifications = ((await octokit.request("GET /notifications")).data) as GitHubNotifications;
    console.log("unfilteredNotifications", notifications);
    const filteredNotifications = filterPullRequestNotifications(notifications);
    console.log("filteredNotifications", filteredNotifications);
    for (const notification of filteredNotifications) {
      const pullRequestUrl = notification.subject.url;
      const pullRequest = ((await octokit.request(`GET ${pullRequestUrl}`)).data) as GitHubPullRequest;
      console.log("unfilteredPullRequest", pullRequest);
      // remove notification if PR is a draft
      if (pullRequest.draft || pullRequest.state === "closed") {
        filteredNotifications.splice(filteredNotifications.indexOf(notification), 1);
        continue;
      }

      // get issue number from PR body
      const issueNumberMatch = pullRequest.body ? pullRequest.body.match(/Resolves .*\/issues\/(\d+)/) || pullRequest.body.match(/Resolves #(\d+)/) : null;

      // if issue number is not found, remove notification
      if (!issueNumberMatch) {
        filteredNotifications.splice(filteredNotifications.indexOf(notification), 1);
        continue;
      }

      const issueNumber = issueNumberMatch[1];
      const issueUrl = pullRequest.issue_url.replace(/issues\/\d+$/, `issues/${issueNumber}`);
      const issue = ((await octokit.request(`GET ${issueUrl}`)).data) as GitHubIssue;
      console.log("unfilteredIssue", issue);
      // remove notification if PR is not from assignee, or issue is closed
      // if(issue.assignee?.id !== pullRequest.user.id || issue.state === "closed") {
      //   filteredNotifications.splice(filteredNotifications.indexOf(notification), 1);
      //   continue;
      // }

      console.log("issue", issue);
      aggregatedData.push({ "notification": notification, "pullRequest": pullRequest, "issue": issue });
    }

    console.log("aggregatedData", aggregatedData);
    return aggregatedData;
  } catch(error) {
    if (!!error && typeof error === "object" && "status" in error && error.status === 403) {
      await handleRateLimit(providerToken ? octokit : undefined, error as RequestError);
    }
    console.warn("You have been logged out. Please login again.", error);
  }
  return null;
}

function preFilterNotifications(notifications: GitHubNotification[]): GitHubNotifications {
  return notifications.filter(notification => {
    // Ignore CI activity notifications
    if (notification.reason === 'ci_activity') {
      return false;
    }

    // Ignore notifications from repos that are not Ubiquity
    const repoName = notification.repository.full_name.split('/')[0];
    if (repoName !== 'ubiquity' && repoName !== 'ubiquity-os' && repoName !== 'ubiquity-os-marketplace') {
      return false;
    }

    return true;
  });
}

function filterPullRequestNotifications(notifications: GitHubNotification[]): GitHubNotifications {
  return preFilterNotifications(notifications).filter(notification => {
    // Only return pull request notifications
    return notification.subject.type === 'PullRequest';
  });
}