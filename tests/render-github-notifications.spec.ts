import { beforeEach, describe, expect, mock, test } from "bun:test";

type TestGlobals = typeof globalThis & {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  fetch: typeof fetch;
};

const testGlobals = globalThis as TestGlobals;
testGlobals.SUPABASE_URL = "test";
testGlobals.SUPABASE_ANON_KEY = "test";
const notificationsContainer = document.createElement("div");
notificationsContainer.id = "issues-container";
document.body.replaceChildren(notificationsContainer);

const getGitHubAccessTokenMock = mock(() => Promise.resolve("token"));

void mock.module("../src/home/home", () => ({
  notificationsContainer,
  shouldShowBotNotifications: false,
}));
void mock.module("../src/home/rendering/render-preview-modal", () => {
  const modal = document.createElement("div");
  modal.id = "preview-modal";
  modal.innerHTML = '<button class="close-preview"></button><div class="modal-content"></div><div class="modal-toolbar"></div>';
  return {
    modal,
    modalBodyInner: document.createElement("div"),
    titleAnchor: document.createElement("a"),
    titleHeader: document.createElement("h2"),
  };
});
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
  getGitHubAccessToken: getGitHubAccessTokenMock,
  clearStoredSession: mock(() => {}),
  getGitHubUserName: mock(() => null),
}));
void mock.module("../src/home/getters/get-viewer-login", () => ({
  resolveViewerLogin: mock(() => Promise.resolve(null)),
}));

import type { GitHubAggregated } from "../src/home/github-types";

const { renderNotifications } = await import("../src/home/rendering/render-github-notifications");

describe("renderNotifications", () => {
  beforeEach(() => {
    notificationsContainer.innerHTML = "";
    notificationsContainer.className = "";
    document.body.replaceChildren(notificationsContainer);
    window.scrollTo = mock();
    class NoopIntersectionObserver implements IntersectionObserver {
      readonly root: Element | null = null;
      readonly rootMargin = "";
      readonly thresholds: ReadonlyArray<number> = [];
      disconnect(): void {}
      observe(): void {}
      unobserve(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    globalThis.IntersectionObserver = NoopIntersectionObserver as unknown as typeof IntersectionObserver;
    const fetchMock = mock(() =>
      Promise.resolve({
        ok: true,
        json: mock(() =>
          Promise.resolve({
            user: { login: "testuser", type: "User", avatar_url: "https://example.com/avatar.png" },
            html_url: "https://github.com/testuser",
            body: "Comment body",
          })
        ),
      } as unknown as Response)
    );
    testGlobals.fetch = fetchMock as unknown as typeof fetch;
    getGitHubAccessTokenMock.mockResolvedValue("token");
  });

  test("appends issue-element-inner with mocked fetch", async () => {
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
