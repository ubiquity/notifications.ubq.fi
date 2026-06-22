import { describe, expect, mock, test } from "bun:test";

void mock.module("../src/home/rendering/render-preview-modal", () => ({
  modal: document.createElement("div"),
  modalBodyInner: document.createElement("div"),
  titleAnchor: document.createElement("a"),
  titleHeader: document.createElement("h2"),
}));
void mock.module("../src/home/ready-toolbar", () => ({
  toolbar: { scrollTo: mock() },
}));
void mock.module("../src/home/rendering/render-github-login-button", () => ({
  authenticationElement: document.getElementById("authentication"),
  checkSupabaseSession: mock(() => Promise.resolve(null)),
  getSupabase: mock(() => null),
  gitHubLoginButton: document.createElement("button"),
  renderAugmentAccessButton: mock(() => null),
  renderGitHubLoginButton: mock(() => {}),
  renderGitRevision: mock(() => {}),
}));
void mock.module("../src/home/getters/get-github-access-token", () => ({
  getGitHubAccessToken: mock(() => null),
  clearStoredSession: mock(() => {}),
  getGitHubUserName: mock(() => null),
}));
void mock.module("../src/home/getters/get-viewer-login", () => ({
  resolveViewerLogin: mock(() => Promise.resolve(null)),
}));

type TestGlobals = typeof globalThis & {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
};

const testGlobals = globalThis as TestGlobals;
testGlobals.SUPABASE_URL = "test";
testGlobals.SUPABASE_ANON_KEY = "test";

import type { GitHubIssue, GitHubNotifications, GitHubPullRequest } from "../src/home/github-types";

const { processNotifications, getPullRequestNotifications, getIssueNotifications } = await import("../src/home/fetch-github/fetch-data");

describe("processNotifications", () => {
  test("handles PR with missing base.repo without throwing", async () => {
    const token = "test-token";
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

    expect(async () => await processNotifications(notifications, pullRequests, issues, token)).not.toThrow();
    const result = await processNotifications(notifications, pullRequests, issues, token);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result).toHaveLength(1);
    expect(result[0].backlinkCount).toBeGreaterThanOrEqual(1);
  });

  test("filters out draft PRs", async () => {
    const token = "test-token";
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
    const result = await getPullRequestNotifications(devpoolRepos, notifications, pullRequests, issues, token);
    expect(result).toHaveLength(0);
  });

  test("filters out closed issues", () => {
    const token = "test-token";
    const devpoolRepos = new Set(["owner/repo"]);
    const notifications: GitHubNotifications = [];
    const issues = [
      { url: "https://api.github.com/repos/owner/repo/issues/456", state: "closed", repository_url: "https://api.github.com/repos/owner/repo" },
    ] as unknown as GitHubIssue[];
    const result = getIssueNotifications(devpoolRepos, notifications, issues, token);
    return result.then((r) => expect(r).toHaveLength(0));
  });
});
