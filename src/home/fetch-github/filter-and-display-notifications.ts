import { getNotifications } from "../home";
import { applyAvatarsToNotifications, renderEmpty, renderNotifications } from "../rendering/render-github-notifications";
import { Sorting } from "../sorting/generate-sorting-buttons";
import { sortIssuesController } from "../sorting/sort-controller";
import { GitHubAggregated } from "../github-types";

export type Options = {
  ordering: "normal" | "reverse";
};

// checks the cache's integrity, sorts issues, checks Directory/Proposals toggle, renders them and applies avatars
export async function displayNotifications({
  sorting,
  options = { ordering: "normal" },
  skipAnimation = false,
  preloadedNotifications,
}: {
  sorting?: Sorting;
  options?: { ordering: string };
  skipAnimation?: boolean;
  preloadedNotifications?: GitHubAggregated[] | null;
} = {}) {
  const notifications = preloadedNotifications ?? (await getNotifications());
  if (notifications === null || notifications.length === 0) {
    await renderEmpty();
    return;
  }
  const sortedIssues = sortIssuesController(notifications, sorting, options);
  await renderNotifications(sortedIssues, skipAnimation);
  applyAvatarsToNotifications();
}
