import { GitHubAggregated } from "../github-types";
import { SORTING_OPTIONS } from "./generate-sorting-buttons";
import { sortByPriority } from "./sort-by-priority";
import { sortByActivity } from "./sort-by-activity";

export function sortBy(tasks: GitHubAggregated[], sortBy: (typeof SORTING_OPTIONS)[number]) {
  switch (sortBy) {
    case "priority":
      return sortByPriority(tasks);
    case "activity":
      return sortByActivity(tasks);
    default:
      return tasks;
  }
}
