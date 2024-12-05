import { GitHubNotifications } from "../github-types";

export function filterIssuesBySearch(filterText: string) {
  const searchResults = taskManager.issueSearcher.search(filterText);
  //Create the new GithubIssue[] array based on the ranking in the searchResults
  const sortedIssues = Array.from(searchResults.entries())
    .filter(([, result]) => result.score > 0)
    .sort((a, b) => b[1].score - a[1].score)
    .map(([id]) => taskManager.getGitHubIssueById(id))
    .filter((issue): issue is GitHubNotifications => issue !== undefined);
  return sortedIssues;
}
