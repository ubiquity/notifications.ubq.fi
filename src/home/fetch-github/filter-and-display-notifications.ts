import { GitHubAggregated, GitHubNotifications } from "../github-types";
import { applyAvatarsToNotifications, renderEmpty, renderNotifications } from "../rendering/render-github-notifications";
import { renderOrgHeaderLabel } from "../rendering/render-org-header";
import { closeModal } from "../rendering/render-preview-modal";
import { filterIssuesBySearch } from "../sorting/filter-issues-by-search";
import { Sorting } from "../sorting/generate-sorting-buttons";
import { sortIssuesController } from "../sorting/sort-issues-controller";

export type Options = {
  ordering: "normal" | "reverse";
};

// start at view based on URL
export let isProposalOnlyViewer = new URLSearchParams(window.location.search).get("proposal") === "true";

export const viewToggle = document.getElementById("view-toggle") as HTMLInputElement;

if (isProposalOnlyViewer) {
  viewToggle.checked = true;
}

if (!viewToggle) {
  throw new Error("Could not find view toggle");
}

// if the Directory/Proposals toggle is clicked re-render the issues
viewToggle.addEventListener("click", () => {
  isProposalOnlyViewer = !isProposalOnlyViewer;

  // If you are in a preview, close it
  closeModal();
  void displayGitHubIssues();
});

function getProposalsOnlyFilter(getProposals: boolean) {
  return (issue: GitHubNotifications) => {
    if (!issue?.labels) return false;

    const hasPriceLabel = issue.labels.some((label) => {
      if (typeof label === "string") return false;
      return label.name?.startsWith("Price: ") || label.name?.startsWith("Price: ");
    });

    return getProposals ? !hasPriceLabel : hasPriceLabel;
  };
}

function filterIssuesByOrganization(issues: GitHubNotifications): GitHubNotifications {
  // get organization name from first thing after / in URL
  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const urlOrgName = pathSegments.length > 0 ? pathSegments[0] : null;

  //  if there is no organization name in the URL, return all issues
  if (!urlOrgName) return issues;

  // filter issues by matching the URL organization name with the issue's organization name
  const filteredIssues = issues.filter((issue) => {
    const [issueOrgName] = issue.repository_url.split("/").slice(-2);
    return issueOrgName === urlOrgName;
  });

  // if no issues match the organization, redirect to home
  if (filteredIssues.length === 0) {
    console.log(`No issues found for organization "${urlOrgName}". Redirecting to the home page.`);
    window.location.href = "/";
  }

  renderOrgHeaderLabel(urlOrgName);

  return filteredIssues;
}

// checks the cache's integrity, sorts issues, checks Directory/Proposals toggle, renders them and applies avatars
export async function displayNotifications(
  notifications: GitHubAggregated[] | null, {
  sorting,
  options = { ordering: "normal" },
  skipAnimation = false,
}: {
  sorting?: Sorting;
  options?: { ordering: string };
  skipAnimation?: boolean;
} = {}) {
  //const sortedIssues = sortIssuesController(cachedTasks, sorting, options);
  //let sortedAndFiltered = sortedIssues.filter(getProposalsOnlyFilter(isProposalOnlyViewer));
  //sortedAndFiltered = filterIssuesByOrganization(sortedAndFiltered);
  if(notifications === null || notifications.length === 0){
    renderEmpty();
    return;
  }
  await renderNotifications(notifications, skipAnimation);
  applyAvatarsToNotifications();
}

export async function searchDisplayGitHubIssues({ searchText, skipAnimation = false }: { searchText: string; skipAnimation?: boolean }) {
  const searchResult = filterIssuesBySearch(searchText);
  let filteredIssues = searchResult.filter(getProposalsOnlyFilter(isProposalOnlyViewer));
  filteredIssues = filterIssuesByOrganization(filteredIssues);
  renderNotifications(filteredIssues, skipAnimation);
  applyAvatarsToNotifications();
}
