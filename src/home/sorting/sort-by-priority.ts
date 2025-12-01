import { GitHubAggregated, GitHubLabel } from "../github-types";

export function sortByPriority(notifications: GitHubAggregated[]) {
  const priorityRegex = /priority\s*:\s*([0-9]+)/i;

  return notifications.sort((a, b) => {
    function getPriority(notification: GitHubAggregated) {
      const labels = notification.issue?.labels || notification.pullRequest?.labels;
      if (!labels || !Array.isArray(labels)) return -1;

      const priorityLabel = labels.find((label): label is GitHubLabel & { name: string } => {
        return typeof label === "object" && label !== null && "name" in label && typeof label.name === "string" && priorityRegex.test(label.name);
      });
      const match = priorityLabel?.name.match(priorityRegex);
      return match ? parseInt(match[1], 10) : -1;
    }

    return getPriority(b) - getPriority(a);
  });
}
