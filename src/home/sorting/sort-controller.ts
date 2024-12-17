import { GitHubAggregated } from "../github-types";
import { Sorting } from "./generate-sorting-buttons";
import { sortBy } from "./sort-by";
import { sortByPriority } from "./sort-by-priority";
import { sortByBacklinks } from "./sort-by-backlinks";
import { sortByActivity } from "./sort-by-activity";

export function sortIssuesController(tasks: GitHubAggregated[], sorting?: Sorting, options = { ordering: "normal" }) {
  let sortedNotifications = tasks;

  if (sorting) {
    sortedNotifications = sortBy(sortedNotifications, sorting);
  } else {
    const sortedByFreshness = sortByActivity(sortedNotifications);  // activity last
    console.log("sortedByFreshness", sortedByFreshness);
    const sortedByBacklinks = sortByBacklinks(sortedByFreshness);   // backlinks second
    console.log("sortedByBacklinks", sortedByBacklinks);
    const sortedByPriority = sortByPriority(sortedByBacklinks);     // highest priority first
    console.log("sortedByPriority", sortedByPriority);
    sortedNotifications = sortedByPriority;
  }

  if (options.ordering == "reverse") {
    sortedNotifications = sortedNotifications.reverse();
  }

  return sortedNotifications;
}
