import { Octokit } from "@octokit/rest";
import { GitHubNotification, GitHubNotifications } from "../github-types";
import { getGitHubAccessToken } from "../getters/get-github-access-token";
import { handleRateLimit } from "./handle-rate-limit";
import { RequestError } from "@octokit/request-error";
export const organizationImageCache = new Map<string, Blob | null>(); // this should be declared in image related script

// Fetches notifications from GitHub, must be authenticated
export async function fetchNotifications(): Promise<GitHubNotifications | null> {
  const providerToken = await getGitHubAccessToken();
  const octokit = new Octokit({ auth: providerToken });

  try {
    const response = ((await octokit.request("GET /notifications")).data) as GitHubNotifications;
    console.log("unfiltered", response);
    const filtered = filterNotifications(response);
    console.log("filtered", filtered);
    return filtered;
  } catch(error) {
    if (!!error && typeof error === "object" && "status" in error && error.status === 403) {
      await handleRateLimit(providerToken ? octokit : undefined, error as RequestError);
    }
    console.warn("You have been logged out. Please login again.", error);
  }
  return null;
}

function filterNotifications(notifications: GitHubNotification[]): GitHubNotifications {
  return notifications.filter(notification => {
    if (notification.reason === 'ci_activity') {
      return false;
    }

    const repoName = notification.repository.full_name.split('/')[0];
    if (repoName !== 'ubiquity' && repoName !== 'ubiquity-os' && repoName !== 'ubiquity-os-marketplace') {
      return false;
    }

    return true;
  });
}