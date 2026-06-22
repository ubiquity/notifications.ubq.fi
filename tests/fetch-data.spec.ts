import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

type TestGlobals = typeof globalThis & {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  fetch: typeof fetch;
};

const testGlobals = globalThis as TestGlobals;
testGlobals.SUPABASE_URL = "test";
testGlobals.SUPABASE_ANON_KEY = "test";

import * as indexedDb from "../src/home/getters/get-indexed-db";
import type { GitHubIssue, GitHubLabel, GitHubNotification, GitHubNotifications, GitHubPullRequest } from "../src/home/github-types";

void mock.module("../src/home/getters/get-github-access-token", () => ({
  clearStoredSession: mock(() => {}),
  getGitHubAccessToken: mock(() => Promise.resolve("token")),
  getGitHubUserName: mock(() => null),
}));
void mock.module("../src/home/getters/get-viewer-login", () => ({
  resolveViewerLogin: mock(() => Promise.resolve(null)),
}));

const { fetchIssues, fetchPullRequests, fetchAllNotifications, processNotifications, getIssueNotifications } = await import(
  "../src/home/fetch-github/fetch-data"
);

let saveNotificationsToCacheSpy: ReturnType<typeof spyOn>;
let saveAggregatedNotificationsToCacheSpy: ReturnType<typeof spyOn>;

describe("fetch-data helpers", () => {
  const realFetch = testGlobals.fetch;

  beforeEach(() => {
    saveNotificationsToCacheSpy = spyOn(indexedDb, "saveNotificationsToCache").mockResolvedValue(undefined);
    saveAggregatedNotificationsToCacheSpy = spyOn(indexedDb, "saveAggregatedNotificationsToCache").mockResolvedValue(undefined);
  });

  afterEach(() => {
    saveNotificationsToCacheSpy.mockRestore();
    saveAggregatedNotificationsToCacheSpy.mockRestore();
    testGlobals.fetch = realFetch;
  });

  test("fetchIssues returns [] on non-ok response", async () => {
    testGlobals.fetch = mock(() => Promise.resolve({ ok: false, status: 500, statusText: "Internal Error" } as Response)) as unknown as typeof fetch;
    const issues = await fetchIssues();
    expect(issues).toEqual([]);
  });

  test("fetchPullRequests returns parsed JSON on ok", async () => {
    const pr: Partial<GitHubPullRequest> = { url: "https://api.github.com/repos/owner/repo/pulls/1", state: "open", draft: false, body: "" };
    testGlobals.fetch = mock(() => Promise.resolve({ ok: true, json: mock(() => Promise.resolve([pr])) } as unknown as Response)) as unknown as typeof fetch;
    const pulls = await fetchPullRequests();
    expect(pulls.length).toBe(1);
    expect(pulls[0].url).toBe(pr.url);
  });

  test("pre-filter excludes disallowed reasons and repos", async () => {
    const devpoolRepos = new Set(["owner/repo"]);
    const notifications: GitHubNotifications = [
      {
        id: "n1",
        reason: "comment", // allowed; repo matches
        subject: { title: "Ignored", url: "https://api.github.com/repos/owner/repo/issues/1", type: "Issue" },
        repository: { full_name: "owner/repo" },
        updated_at: "2023-01-01T00:00:00Z",
      } as unknown as GitHubNotification,
      {
        id: "n2",
        reason: "assign", // allowed reason, but wrong repo
        subject: { title: "Wrong Repo", url: "https://api.github.com/repos/other/repo/issues/2", type: "Issue" },
        repository: { full_name: "other/repo" },
        updated_at: "2023-01-01T00:00:00Z",
      } as unknown as GitHubNotification,
    ];

    const issues: Partial<GitHubIssue>[] = [
      { url: "https://api.github.com/repos/owner/repo/issues/1", state: "open", repository_url: "https://api.github.com/repos/owner/repo" },
    ];
    const result = await getIssueNotifications(devpoolRepos, notifications, issues as unknown as GitHubIssue[], "token");
    expect(result).toHaveLength(1);
    expect(result?.[0]?.notification.id).toBe("n1");
  });

  test("processNotifications filters by Priority label and counts backlinks for issues", async () => {
    const notifications: GitHubNotifications = [
      {
        id: "n3",
        reason: "assign",
        subject: { title: "Issue With Priority", url: "https://api.github.com/repos/owner/repo/issues/42", type: "Issue" },
        repository: { full_name: "owner/repo" },
        updated_at: "2023-01-01T00:00:00Z",
      } as unknown as GitHubNotification,
      {
        id: "n4",
        reason: "assign",
        subject: { title: "Issue Without Priority", url: "https://api.github.com/repos/owner/repo/issues/43", type: "Issue" },
        repository: { full_name: "owner/repo" },
        updated_at: "2023-01-01T00:00:00Z",
      } as unknown as GitHubNotification,
    ];

    const issues: Partial<GitHubIssue>[] = [
      {
        url: "https://api.github.com/repos/owner/repo/issues/42",
        state: "open",
        number: 42,
        repository_url: "https://api.github.com/repos/owner/repo",
        labels: [{ name: "Priority: High" } as GitHubLabel],
        body: "See details",
      },
      {
        url: "https://api.github.com/repos/owner/repo/issues/43",
        state: "open",
        number: 43,
        repository_url: "https://api.github.com/repos/owner/repo",
        labels: [], // will be filtered out
        body: null,
      },
      // Another issue body linking by short ref
      {
        url: "https://api.github.com/repos/owner/repo/issues/99",
        state: "open",
        number: 99,
        repository_url: "https://api.github.com/repos/owner/repo",
        labels: [],
        body: "Related to #42",
      },
    ];

    const pullRequests: Partial<GitHubPullRequest>[] = [
      {
        url: "https://api.github.com/repos/owner/repo/pulls/100",
        state: "open",
        draft: false,
        base: { repo: { url: "https://api.github.com/repos/owner/repo" } } as GitHubPullRequest["base"],
        body: "Fixes https://api.github.com/repos/owner/repo/issues/42", // full issue URL backlink
      },
    ];

    const result = await processNotifications(notifications, pullRequests as unknown as GitHubPullRequest[], issues as unknown as GitHubIssue[], "token");
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.length).toBe(1);
    const agg = result[0];
    expect(agg.issue.number).toBe(42);
    // Should count 2 backlinks: PR full URL + short ref in an issue in same repo
    expect(agg.backlinkCount).toBeGreaterThanOrEqual(2);
  });

  test("fetchAllNotifications saves to cache when data returns", async () => {
    localStorage.setItem(
      "sb-local-auth-token",
      JSON.stringify({
        expires_at: Math.floor(Date.now() / 1000) + 60,
        provider_token: "token",
      })
    );

    const issue: Partial<GitHubIssue> = {
      url: "https://api.github.com/repos/owner/repo/issues/1",
      state: "open",
      repository_url: "https://api.github.com/repos/owner/repo",
      labels: [{ name: "Priority: High" } as GitHubLabel],
    };
    const fetchSequence = mock();
    fetchSequence
      .mockResolvedValueOnce({ ok: true, json: mock(() => Promise.resolve([])) } as unknown as Response) // pulls
      .mockResolvedValueOnce({ ok: true, json: mock(() => Promise.resolve([issue])) } as unknown as Response); // issues
    testGlobals.fetch = fetchSequence as unknown as typeof fetch;

    const result = await fetchAllNotifications();
    expect(saveNotificationsToCacheSpy).toHaveBeenCalled();
    expect(saveAggregatedNotificationsToCacheSpy).toHaveBeenCalled();
    // With empty notifications from Octokit stub, returns []
    expect(result).toEqual([]);
  });
});
