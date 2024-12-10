import { GitHubAggregated } from "../github-types";

export function sortByFreshness(tasks: GitHubAggregated[]) {
  return tasks.sort((a, b) => {
    const dateA = new Date(a.notification.updated_at);
    const dateB = new Date(b.notification.updated_at);
    return dateB.getTime() - dateA.getTime();
  });
}