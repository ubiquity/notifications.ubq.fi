import { GitHubAggregated } from "../github-types";
import { SORTING_OPTIONS } from "./generate-sorting-buttons";
import { sortByPriority } from "./sort-by-priority";
import { sortByOldest } from "./sort-by-oldest";

export function sortBy(tasks: GitHubAggregated[], sortBy: (typeof SORTING_OPTIONS)[number]){
  switch (sortBy) {
    case "priority":
      return sortByPriority(tasks);
    case "oldest":
      return sortByOldest(tasks);
    default:
      return tasks;
  }
}
