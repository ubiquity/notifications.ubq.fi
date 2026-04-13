import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";

type TestGlobals = typeof globalThis & {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  fetch: typeof fetch;
};

// Minimal SUPABASE env + client mock to satisfy transitive imports
const testGlobals = global as TestGlobals;
testGlobals.SUPABASE_URL = "test";
testGlobals.SUPABASE_ANON_KEY = "test";
mock.module("@supabase/supabase-js", () => ({
  createClient: mock(() => ({})),
}));

// Local stubs
mock.module("@octokit/rest", () => ({
  Octokit: class {
    request = mock().mockResolvedValue({ data: [] });
  },
}));
mock.module("@octokit/request-error", () => {
  return {
    RequestError: class RequestError extends Error {
      status?: number;
    },
  };
});
mock.module("../src/home/getters/get-github-access-token", () => ({
  getGitHubAccessToken: mock().mockReturnValue("test-token"),
}));

import * as indexedDb from "../src/home/getters/get-indexed-db";
import { fetchIssues, fetchPullRequests, fetchAllNotifications, processNotifications, getIssueNotifications } from "../src/home/fetch-github/fetch-data";
import { GitHubIssue, GitHubLabel, GitHubNotification, GitHubNotifications, GitHubPullRequest } from "../src/home/github-types";

let saveNotificationsToCacheSpy: ReturnType<typeof spyOn>;
let saveAggregatedNotificationsToCacheSpy: ReturnType<typeof spyOn>;

describe("fetch-data helpers", () => {
  const realFetch = testGlobals.fetch;

  beforeEach(() => {
    saveNotificationsToCacheSpy = spyOn(indexedDb, "saveNotificationsToCache").mockResolvedValue(undefined);
    saveAggregatedNotificationsToCacheSpy = spyOn(indexedDb, "saveAggregatedNotificationsToCache").mockResolvedValue(undefined);
  });

  afterEach(() => {
    mock.restore();
    testGlobals.fetch = realFetch;
  });

  it("fetchIssues returns [] on non-ok response", async () => {
    testGlobals.fetch = mock()
      .mockResolvedValue({ ok: false, status: 500, statusText: "Internal Error" } as Response);
    const issues = await fetchIssues();
    expect(issues).toEqual([]);
  });

  it("fetchPullRequests returns parsed JSON on ok", async () => {
    const pr: Partial<GitHubPullRequest> = { url: "https://api.github.com/repos/owner/repo/pulls/1", state: "open", draft: false, body: "" };
    testGlobals.fetch = mock()
      .mockResolvedValue({ ok: true, json: mock().mockResolvedValue([pr]) } as unknown as Response);
    const pulls = await fetchPullRequests();
    expect(pulls.length).toBe(1);
    expect(pulls[0].url).toBe(pr.url);
  });

  it("pre-filter excludes disallowed reasons and repos", async () => {
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

  it("processNotifications filters by Priority label and counts backlinks for issues", async () => {
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

  it("fetchAllNotifications saves to cache when data returns", async () => {
    // Mock fetch for pulls and issues
    const issue: Partial<GitHubIssue> = {
      url: "https://api.github.com/repos/owner/repo/issues/1",
      state: "open",
      repository_url: "https://api.github.com/repos/owner/repo",
      labels: [{ name: "Priority: High" } as GitHubLabel],
    };
    testGlobals.fetch = mock()
      .mockResolvedValueOnce({ ok: true, json: mock().mockResolvedValue([]) } as unknown as Response) // pulls
      .mockResolvedValueOnce({ ok: true, json: mock().mockResolvedValue([issue]) } as unknown as Response); // issues

    const result = await fetchAllNotifications();
    expect(saveNotificationsToCacheSpy).toHaveBeenCalled();
    expect(saveAggregatedNotificationsToCacheSpy).toHaveBeenCalled();
    // With empty notifications from Octokit stub, returns []
    expect(result).toEqual([]);
  });
});
