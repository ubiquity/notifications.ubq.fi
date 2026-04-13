import { describe, it, expect, mock } from "bun:test";
import type { GitHubAggregated } from "../src/home/github-types";

// Break the circular dependency chain by mocking the upstream module
// home.ts -> generate-sorting-buttons -> sorting-manager -> home.ts
mock.module("../src/home/home", () => ({
  notificationsContainer: document.getElementById("issues-container") as HTMLDivElement,
  shouldShowBotNotifications: false,
}));

// Mock transitive dependencies that pull in heavy modules or hit the network
mock.module("../src/home/getters/get-github-access-token", () => ({
  getGitHubAccessToken: mock().mockResolvedValue("test-token"),
  clearStoredSession: mock(),
  getGitHubUserName: mock().mockReturnValue("testuser"),
}));
mock.module("../src/home/getters/get-viewer-login", () => ({
  resolveViewerLogin: mock().mockResolvedValue("testuser"),
}));
mock.module("../src/home/mark-as-read", () => ({
  markNotificationAsRead: mock().mockResolvedValue(undefined),
}));

const { renderNotifications } = await import("../src/home/rendering/render-github-notifications");

describe("renderNotifications", () => {
  it("appends notification elements to the container", async () => {
    const container = document.getElementById("issues-container") as HTMLDivElement;
    container.innerHTML = "";

    const notification = {
      notification: {
        id: "100",
        reason: "assign",
        subject: {
          title: "Test Issue",
          url: "https://api.github.com/repos/owner/repo/issues/1",
          type: "Issue",
          latest_comment_url: null,
        },
        repository: { url: "https://api.github.com/repos/owner/repo" },
        updated_at: new Date().toISOString(),
      },
      issue: {
        url: "https://api.github.com/repos/owner/repo/issues/1",
        html_url: "https://github.com/owner/repo/issues/1",
        number: 1,
        state: "open",
        labels: [{ name: "Priority: High" }],
      },
      pullRequest: null,
      backlinkCount: 0,
    };

    await renderNotifications([notification as unknown as GitHubAggregated], true);

    const inner = container.querySelector(".issue-element-inner");
    expect(inner).not.toBeNull();
    expect(inner?.getAttribute("data-issue-id")).toBe("100");
    expect(container.classList.contains("ready")).toBe(true);
  });

  it("does not duplicate already-rendered notifications", async () => {
    const container = document.getElementById("issues-container") as HTMLDivElement;
    container.innerHTML = "";

    const notification = {
      notification: {
        id: "200",
        reason: "comment",
        subject: {
          title: "Duplicate Test",
          url: "https://api.github.com/repos/owner/repo/issues/2",
          type: "Issue",
          latest_comment_url: null,
        },
        repository: { url: "https://api.github.com/repos/owner/repo" },
        updated_at: new Date().toISOString(),
      },
      issue: {
        url: "https://api.github.com/repos/owner/repo/issues/2",
        html_url: "https://github.com/owner/repo/issues/2",
        number: 2,
        state: "open",
        labels: [],
      },
      pullRequest: null,
      backlinkCount: 0,
    };

    await renderNotifications([notification as unknown as GitHubAggregated], true);
    await renderNotifications([notification as unknown as GitHubAggregated], true);

    const matches = container.querySelectorAll('[data-issue-id="200"]');
    expect(matches.length).toBe(1);
  });

  it("renders empty state when no notifications provided", async () => {
    const container = document.getElementById("issues-container") as HTMLDivElement;
    container.innerHTML = "";

    await renderNotifications([], true);

    expect(container.classList.contains("ready")).toBe(true);
    // renderEmpty should have been called, creating the empty message element
    const emptyEl = container.querySelector(".issue-element-inner");
    expect(emptyEl).not.toBeNull();
  });
});
