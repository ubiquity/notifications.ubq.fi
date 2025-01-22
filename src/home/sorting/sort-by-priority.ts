import { GitHubAggregated } from "../github-types";

export function sortByPriority(notifications: GitHubAggregated[]) {
  const priorityRegex = /Priority: (\d+)/;

  return notifications.sort((a, b) => {
    function getPriority(notification: GitHubAggregated) {
      const priorityLabel = notification.issue.labels.find(
        (label): label is { name: string } => typeof label === "object" && "name" in label && typeof label.name === "string" && priorityRegex.test(label.name)
      );
      const match = priorityLabel?.name.match(priorityRegex);
      return match ? parseInt(match[1], 10) : -1;
    }

    return getPriority(b) - getPriority(a);
  });
}
