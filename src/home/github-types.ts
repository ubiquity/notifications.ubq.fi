import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";

export interface AvatarCache {
  [organization: string]: string | null;
}

export const GITHUB_TASKS_STORAGE_KEY = "gitHubTasks";

export type TaskStorageItems = {
  timestamp: number; // in milliseconds
  tasks: GitHubNotifications;
  loggedIn: boolean;
};

export type GitHubUserResponse = RestEndpointMethodTypes["users"]["getByUsername"]["response"];
export type GitHubUser = GitHubUserResponse["data"];
export type GitHubIssue = RestEndpointMethodTypes["issues"]["get"]["response"]["data"];
export type GitHubPullRequest = RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];
export type GitHubNotifications = RestEndpointMethodTypes["activity"]["listNotificationsForAuthenticatedUser"]["response"]["data"];
export type GitHubNotification = GitHubNotifications[0];
export type GitHubAggregated = {
  issue: GitHubIssue;
  pullRequest: GitHubPullRequest | null;
  notification: GitHubNotification;
  backlinkCount: number;
};
export type GitHubLabel =
  | {
      id?: number;
      node_id?: string;
      url?: string;
      name: string;
      description?: string | null;
      color?: string | null;
      default?: boolean;
    }
  | string;
