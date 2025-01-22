// import { GitHubAggregated, GitHubNotifications } from "../github-types";
import { getNotifications } from "../home";
import { applyAvatarsToNotifications, renderEmpty, renderNotifications } from "../rendering/render-github-notifications";
// import { renderOrgHeaderLabel } from "../rendering/render-org-header";
import { closeModal } from "../rendering/render-preview-modal";
// import { filterIssuesBySearch } from "../sorting/filter-issues-by-search";
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
  //let sortedAndFiltered = sortedIssues.filter(getProposalsOnlyFilter(isProposalOnlyViewer));
  //sortedAndFiltered = filterIssuesByOrganization(sortedAndFiltered);
  await renderNotifications(sortedIssues, skipAnimation);
  applyAvatarsToNotifications();
}
