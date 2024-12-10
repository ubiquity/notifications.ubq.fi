import { GitHubAggregated } from "../github-types";
import { SORTING_OPTIONS } from "./generate-sorting-buttons";
import { sortByReason } from "./sort-by-reason";
import { sortByPriority } from "./sort-by-priority";
import { sortByFreshness } from "./sort-by-freshness";

export function sortBy(tasks: GitHubAggregated[], sortBy: (typeof SORTING_OPTIONS)[number]){
  switch (sortBy) {
    case "priority":
      return sortByPriority(tasks);
    case "freshness":
      return sortByFreshness(tasks);
    case "reason":
      return sortByReason(tasks);
    default:
      return tasks;
  }
}
