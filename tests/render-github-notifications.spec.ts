import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { GitHubAggregated } from "../src/home/github-types";

type TestGlobals = typeof globalThis & {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  fetch: typeof fetch;
};

const testGlobals = globalThis as TestGlobals;
testGlobals.SUPABASE_URL = "test";
testGlobals.SUPABASE_ANON_KEY = "test";

beforeEach(() => {
  document.body.innerHTML = '<div id="issues-container"></div>';

  // Avoid importing src/home/home.ts (it has side effects at import time).
  mock.module("../src/home/home.ts", () => ({
    notificationsContainer: document.getElementById("issues-container") as HTMLDivElement,
    shouldShowBotNotifications: false,
  }));

  window.scrollTo = mock(() => {}) as unknown as typeof window.scrollTo;

  // Minimal GitHub API comment response.
  testGlobals.fetch = mock(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: mock(async () => ({
      user: { login: "testuser", type: "User", avatar_url: "https://example.com/avatar.png" },
      html_url: "https://github.com/testuser",
      body: "Comment body",
    })),
  })) as unknown as typeof fetch;
});

describe("renderNotifications", () => {
  it("appends issue-element-inner with mocked fetch", async () => {
    const { renderNotifications } = await import("../src/home/rendering/render-github-notifications");

    const notifications = [
      {
        notification: {
          id: "1",
          reason: "review_requested",
          subject: {
            title: "Test Notification",
            url: "https://github.com/owner/repo/issues/123",
            type: "Issue",
            latest_comment_url: "https://api.github.com/repos/owner/repo/issues/123/comments/456",
          },
          repository: { full_name: "owner/repo", url: "https://api.github.com/repos/owner/repo" },
          updated_at: "2023-01-01T00:00:00Z",
        },
        pullRequest: null,
        issue: {
          title: "Test Issue",
          url: "https://api.github.com/repos/owner/repo/issues/123",
          state: "open",
          labels: [{ name: "Priority: High" }],
          assignees: [],
          created_at: "2023-01-01T00:00:00Z",
          updated_at: "2023-01-01T00:00:00Z",
          body: "Issue body",
          repository_url: "https://api.github.com/repos/owner/repo",
          html_url: "https://github.com/owner/repo/issues/123",
          number: 123,
        },
        backlinkCount: 0,
      },
    ] as unknown as GitHubAggregated[];

    await renderNotifications(notifications, true);
    const elements = document.querySelectorAll(".issue-element-inner");
    expect(elements.length).toBe(1);
  });
});
