import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as indexedDb from "../src/home/getters/get-indexed-db";
import type { GitHubIssue, GitHubLabel, GitHubNotification, GitHubNotifications, GitHubPullRequest } from "../src/home/github-types";
import { RequestError } from "./stubs/octokit-request-error";

type TestGlobals = typeof globalThis & {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  fetch: typeof fetch;
};

// Minimal SUPABASE env + client mock to satisfy transitive imports
const testGlobals = globalThis as TestGlobals;
testGlobals.SUPABASE_URL = "test";
testGlobals.SUPABASE_ANON_KEY = "test";

mock.module("@supabase/supabase-js", () => ({
  createClient: mock(() => ({})),
}));

// Keep Octokit interactions local to the test process (no network calls).
mock.module("@octokit/rest", () => ({
  Octokit: class {
    request = mock(async () => ({ data: [] }));
  },
}));

mock.module("@octokit/request-error", () => ({ RequestError }));

// Make getGitHubAccessToken() return a stable token without calling real Supabase.
mock.module("../src/home/rendering/render-github-login-button", () => ({
  checkSupabaseSession: mock(async () => ({
    provider_token: "test-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  })),
}));

const fetchData = await import("../src/home/fetch-github/fetch-data");
const { fetchIssues, fetchPullRequests, fetchAllNotifications, processNotifications } = fetchData;

describe("fetch-data helpers", () => {
  const realFetch = testGlobals.fetch;

  let saveNotificationsToCacheSpy: ReturnType<typeof spyOn> | null = null;
  let saveAggregatedNotificationsToCacheSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    saveNotificationsToCacheSpy = spyOn(indexedDb, "saveNotificationsToCache").mockResolvedValue(undefined);
    saveAggregatedNotificationsToCacheSpy = spyOn(indexedDb, "saveAggregatedNotificationsToCache").mockResolvedValue(undefined);
  });

  afterEach(() => {
    saveNotificationsToCacheSpy?.mockRestore();
    saveAggregatedNotificationsToCacheSpy?.mockRestore();
    saveNotificationsToCacheSpy = null;
    saveAggregatedNotificationsToCacheSpy = null;
    testGlobals.fetch = realFetch;
  });

  it("fetchIssues returns [] on non-ok response", async () => {
    testGlobals.fetch = mock(async () => ({ ok: false, status: 500, statusText: "Internal Error" }) as Response) as unknown as typeof fetch;
    const issues = await fetchIssues();
    expect(issues).toEqual([]);
  });

  it("fetchPullRequests returns parsed JSON on ok", async () => {
    const pr: Partial<GitHubPullRequest> = { url: "https://api.github.com/repos/owner/repo/pulls/1", state: "open", draft: false, body: "" };
    testGlobals.fetch = mock(async () => ({ ok: true, json: mock(async () => [pr]) }) as unknown as Response) as unknown as typeof fetch;
    const pulls = await fetchPullRequests();
    expect(pulls.length).toBe(1);
    expect(pulls[0].url).toBe(pr.url);
  });

  it("pre-filter excludes disallowed reasons and repos", async () => {
    const notifications: GitHubNotifications = [
      {
        id: "n1",
        reason: "comment", // allowed; repo matches
        subject: { title: "Allowed", url: "https://api.github.com/repos/owner/repo/issues/42", type: "Issue" },
        repository: { full_name: "owner/repo" },
        updated_at: "2023-01-01T00:00:00Z",
      } as unknown as GitHubNotification,
      {
        id: "n3",
        reason: "comment", // allowed, but repo does not match devpool set (filtered out)
        subject: { title: "Wrong Repo", url: "https://api.github.com/repos/other/repo/issues/42", type: "Issue" },
        repository: { full_name: "other/repo" },
        updated_at: "2023-01-01T00:00:00Z",
      } as unknown as GitHubNotification,
      {
        id: "n4",
        reason: "comment", // allowed, repo matches, but issue has no priority label (filtered out)
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

  it("fetchAllNotifications saves to cache when data returns", async () => {
    // Mock fetch for pulls and issues.
    const issue: Partial<GitHubIssue> = {
      url: "https://api.github.com/repos/owner/repo/issues/1",
      state: "open",
      repository_url: "https://api.github.com/repos/owner/repo",
      labels: [{ name: "Priority: High" } as GitHubLabel],
    };
    testGlobals.fetch = mock(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (u.includes("partner-pull-requests")) {
        return { ok: true, json: async () => [] } as unknown as Response;
      }
      if (u.includes("partner-open-issues")) {
        return { ok: true, json: async () => [issue] } as unknown as Response;
      }
      // Any extra fetch calls (e.g. viewer login lookup) should still succeed.
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await fetchAllNotifications();
    expect(indexedDb.saveNotificationsToCache).toHaveBeenCalled();
    expect(indexedDb.saveAggregatedNotificationsToCache).toHaveBeenCalled();
    // With empty notifications from Octokit stub, returns []
    expect(result).toEqual([]);
  });
});
