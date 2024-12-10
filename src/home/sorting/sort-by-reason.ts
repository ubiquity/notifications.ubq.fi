import { GitHubAggregated } from "../github-types";

const reasonOrder = [
  "security_alert",
  "review_requested",
  "mention",
  "manual",
  "assign",
  "approval_requested",
  "author"
];

export function sortByReason(tasks: GitHubAggregated[]) {
  return tasks.sort((a, b) => {
    const indexA = reasonOrder.indexOf(a.notification.reason);
    const indexB = reasonOrder.indexOf(b.notification.reason);
    return indexA - indexB;
  });
}