import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "bun:test";
import {
  saveNotificationsToCache,
  getNotificationsFromCache,
  clearNotificationsCache,
  saveAggregatedNotificationsToCache,
  getAggregatedNotificationsFromCache,
} from "../src/home/getters/get-indexed-db";
import { GitHubNotifications } from "../src/home/github-types";

// In Bun, `fake-indexeddb/auto` installs on `window` when it exists.
// Ensure the global `indexedDB` binding is available for app code.
if (typeof indexedDB === "undefined" && typeof window !== "undefined" && (window as unknown as { indexedDB?: unknown }).indexedDB) {
  (globalThis as unknown as { indexedDB?: unknown }).indexedDB = (window as unknown as { indexedDB?: unknown }).indexedDB;
}

describe("IndexedDB cache functions", () => {
  beforeEach(async () => {
    await clearNotificationsCache();
  });

  it("saves and retrieves notifications with TTL", async () => {
    const fetched = [
      {
        id: "1",
        reason: "review_requested",
        subject: {
          title: "Test",
          url: "https://api.github.com/repos/owner/repo/pulls/123",
          type: "PullRequest",
          latest_comment_url: "https://api.github.com/repos/owner/repo/issues/comments/1",
        },
        repository: { full_name: "owner/repo" },
        updated_at: "2023-01-01T00:00:00Z",
      },
    ] as unknown as GitHubNotifications;

    await saveNotificationsToCache(fetched);
    const result = await getNotificationsFromCache();
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("1");
  });

  it("filters out expired items", async () => {
    const fetched = [
      {
        id: "1",
        reason: "review_requested",
        subject: {
          title: "Test",
          url: "https://api.github.com/repos/owner/repo/pulls/123",
          type: "PullRequest",
          latest_comment_url: "https://api.github.com/repos/owner/repo/issues/comments/1",
        },
        repository: { full_name: "owner/repo" },
        updated_at: "2023-01-01T00:00:00Z",
      },
    ] as unknown as GitHubNotifications;
    await saveNotificationsToCache(fetched);

    // Mock time to make item expired (TTL is 5 minutes)
    const realNow = Date.now;
    Date.now = () => realNow() + 10 * 60 * 1000; // 10 minutes later

    const result = await getNotificationsFromCache();
    expect(result.length).toBe(0);

    Date.now = realNow;
  });

  it("overwrites cache on save", async () => {
    const first = [
      {
        id: "old",
        reason: "review_requested",
        subject: {
          title: "Old",
          url: "https://api.github.com/repos/owner/repo/pulls/456",
          type: "PullRequest",
          latest_comment_url: "https://api.github.com/repos/owner/repo/issues/comments/2",
        },
        repository: { full_name: "owner/repo" },
        updated_at: "2023-01-01T00:00:00Z",
      },
    ] as unknown as GitHubNotifications;
    const second: GitHubNotifications = [
      {
        id: "new",
        reason: "assign",
        subject: {
          title: "New",
          url: "https://api.github.com/repos/owner/repo/pulls/789",
          type: "PullRequest",
          latest_comment_url: "https://api.github.com/repos/owner/repo/issues/comments/3",
        },
        repository: { full_name: "owner/repo" },
        updated_at: "2023-01-02T00:00:00Z",
      },
    ] as unknown as GitHubNotifications;

    await saveNotificationsToCache(first);
    await saveNotificationsToCache(second);
    const result = await getNotificationsFromCache();
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("new");
  });

  it("clears cache", async () => {
    await saveAggregatedNotificationsToCache([]);
    await clearNotificationsCache();
    const [raw, aggregated] = await Promise.all([getNotificationsFromCache(), getAggregatedNotificationsFromCache()]);
    expect(raw.length).toBe(0);
    expect(aggregated.length).toBe(0);
  });
});
