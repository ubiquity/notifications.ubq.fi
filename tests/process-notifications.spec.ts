/** @jest-environment jsdom */

type TestGlobals = typeof globalThis & {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
};

const testGlobals = global as TestGlobals;
testGlobals.SUPABASE_URL = "test";
testGlobals.SUPABASE_ANON_KEY = "test";

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({})),
}));
jest.mock("../src/home/rendering/render-preview-modal");
jest.mock("../src/home/ready-toolbar");
jest.mock("../src/home/rendering/render-github-login-button");
jest.mock("../src/home/getters/get-github-access-token", () => ({
  getGitHubAccessToken: jest.fn(),
}));

import { processNotifications, getPullRequestNotifications, getIssueNotifications } from "../src/home/fetch-github/fetch-data";
import { GitHubIssue, GitHubNotifications, GitHubPullRequest } from "../src/home/github-types";

describe("processNotifications", () => {
  it("handles PR with missing base.repo without throwing", async () => {
    const notifications = [
      {
        id: "1",
        reason: "review_requested",
        subject: {
          title: "Test PR",
          url: "https://api.github.com/repos/owner/repo/pulls/123",
          type: "PullRequest",
          latest_comment_url: "https://api.github.com/repos/owner/repo/issues/comments/123",
        },
        repository: { full_name: "owner/repo" },
        updated_at: "2023-01-01T00:00:00Z",
      },
    ] as unknown as GitHubNotifications;
    const pullRequests = [
      {
        url: "https://api.github.com/repos/owner/repo/pulls/123",
        title: "Test PR",
        state: "open",
        draft: false,
        body: "Resolves #456",
        base: { repo: undefined }, // missing base.repo
        head: { repo: { url: "https://api.github.com/repos/owner/repo" } },
      },
    ] as unknown as GitHubPullRequest[];
    const issues = [
      {
        url: "https://api.github.com/repos/owner/repo/issues/456",
        title: "Test Issue",
        state: "open",
        body: "Issue body",
        repository_url: "https://api.github.com/repos/owner/repo",
        labels: [{ name: "Priority: High" }],
        number: 456,
      },
    ] as unknown as GitHubIssue[];

    expect(async () => await processNotifications(notifications, pullRequests, issues)).not.toThrow();
    const result = await processNotifications(notifications, pullRequests, issues);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result).toHaveLength(1);
    expect(result[0].backlinkCount).toBeGreaterThanOrEqual(1);
  });

  it("filters out draft PRs", async () => {
    const devpoolRepos = new Set(["owner/repo"]);
    const notifications: GitHubNotifications = [];
    const pullRequests = [
      {
        url: "https://api.github.com/repos/owner/repo/pulls/123",
        state: "open",
        draft: true,
        body: "",
        base: { repo: { url: "https://api.github.com/repos/owner/repo" } },
        head: { repo: { url: "https://api.github.com/repos/owner/repo" } },
      },
    ] as unknown as GitHubPullRequest[];
    const issues: GitHubIssue[] = [];
    const result = await getPullRequestNotifications(devpoolRepos, notifications, pullRequests, issues);
    expect(result).toHaveLength(0);
  });

  it("filters out closed issues", () => {
    const devpoolRepos = new Set(["owner/repo"]);
    const notifications: GitHubNotifications = [];
    const issues = [
      { url: "https://api.github.com/repos/owner/repo/issues/456", state: "closed", repository_url: "https://api.github.com/repos/owner/repo" },
    ] as unknown as GitHubIssue[];
    const result = getIssueNotifications(devpoolRepos, notifications, issues);
    expect(result).toHaveLength(0);
  });
});
