import { GitHubAggregated } from "../github-types";

export function sortByBacklinks(tasks: GitHubAggregated[]) {
  return tasks.sort((b, a) => {
    return a.backlinkCount - b.backlinkCount;
  });
}
