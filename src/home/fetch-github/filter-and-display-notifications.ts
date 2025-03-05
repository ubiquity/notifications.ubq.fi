import { getNotifications } from "../home";
import { applyAvatarsToNotifications, renderEmpty, renderNotifications } from "../rendering/render-github-notifications";
import { Sorting } from "../sorting/generate-sorting-buttons";
import { sortIssuesController } from "../sorting/sort-controller";

export type Options = {
  ordering: "normal" | "reverse";
};

// checks the cache's integrity, sorts issues, checks Directory/Proposals toggle, renders them and applies avatars
export async function displayNotifications({
  sorting,
  options = { ordering: "normal" },
  skipAnimation = false,
}: {
  sorting?: Sorting;
  options?: { ordering: string };
  skipAnimation?: boolean;
} = {}) {
  const notifications = await getNotifications();
  if (notifications === null || notifications.length === 0) {
    renderEmpty();
    return;
  }
  const sortedIssues = sortIssuesController(notifications, sorting, options);
  await renderNotifications(sortedIssues, skipAnimation);
  applyAvatarsToNotifications();
}
