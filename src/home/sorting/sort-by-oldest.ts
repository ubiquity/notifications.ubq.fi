import { GitHubAggregated } from "../github-types";

export function sortByOldest(tasks: GitHubAggregated[]) {
  return tasks.sort((b, a) => {
    const dateA = new Date(a.notification.updated_at);
    const dateB = new Date(b.notification.updated_at);
    return dateB.getTime() - dateA.getTime();
  });
}
