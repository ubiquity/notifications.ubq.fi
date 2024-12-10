import { GitHubAggregated, GitHubNotifications } from "../github-types";
import { Sorting } from "./generate-sorting-buttons";
import { sortBy } from "./sort-by";
import { sortByPriority } from "./sort-by-priority";
import { sortByFreshness } from "./sort-by-freshness";
import { sortByReason } from "./sort-by-reason";

export function sortIssuesController(tasks: GitHubAggregated[], sorting?: Sorting, options = { ordering: "normal" }) {
  let sortedNotifications = tasks;

  if (sorting) {
    sortedNotifications = sortBy(sortedNotifications, sorting);
  } else {
    const sortedByReason = sortByReason(sortedNotifications);   // draw criteria 
    const sortedByFreshness = sortByFreshness(sortedByReason);  // oldest first
    const sortedByPriority = sortByPriority(sortedByFreshness); // highest priority first
    sortedNotifications = sortedByPriority;
  }

  if (options.ordering == "reverse") {
    sortedNotifications = sortedNotifications.reverse();
  }

  return sortedNotifications;
}
