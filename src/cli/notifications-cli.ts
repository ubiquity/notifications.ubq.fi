#!/usr/bin/env node
import { fetchIssues, fetchNotifications, fetchPullRequests, processNotifications } from "../home/fetch-github/fetch-data";
import { GitHubAggregated, GitHubLabel } from "../home/github-types";
import { sortIssuesController } from "../home/sorting/sort-controller";

type OutputFormat = "table" | "json";

function getToken(): string | null {
  const args = process.argv.slice(2);
  const tokenArgIndex = args.findIndex((arg) => arg === "--token");
  if (tokenArgIndex !== -1 && args[tokenArgIndex + 1]) {
    return args[tokenArgIndex + 1];
  }
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_AUTH_TOKEN;
  return envToken ?? null;
}

function parseFormat(): OutputFormat {
  const args = process.argv.slice(2);
  if (args.includes("--json")) return "json";
  return "table";
}

function getPriorityValue(labels?: (GitHubLabel | string)[]): { label: string | null; numeric: number } {
  if (!labels) return { label: null, numeric: -1 };
  for (const label of labels) {
    const name = typeof label === "string" ? label : label?.name;
    if (!name) continue;
    const match = name.match(/priority\s*:\s*([0-9]+|.+)/i);
    if (match) {
      const value = match[1].trim();
      const numeric = Number.isFinite(Number(value)) ? Number(value) : -1;
      return { label: value, numeric };
    }
  }
  return { label: null, numeric: -1 };
}

function toHtmlUrl(notification: GitHubAggregated): string {
  const issueUrl = notification.issue?.html_url;
  const prUrl = notification.pullRequest?.html_url;
  if (issueUrl) return issueUrl;
  if (prUrl) return prUrl;
  const subjectUrl = notification.notification.subject.url;
  if (subjectUrl?.startsWith("https://api.github.com/repos/")) {
    return subjectUrl
      .replace("https://api.github.com/repos/", "https://github.com/")
      .replace("/pulls/", "/pull/")
      .replace("/issues/", "/issues/");
  }
  return notification.notification.repository?.html_url || subjectUrl || "";
}

function toRow(notification: GitHubAggregated) {
  const priority = getPriorityValue(notification.issue?.labels || notification.pullRequest?.labels);
  const repo = notification.notification.repository.full_name;
  const title = notification.notification.subject.title;
  const reason = notification.notification.reason || "";
  const updated = notification.notification.updated_at;
  const url = toHtmlUrl(notification);
  return { repo, title, priority: priority.label ?? "-", reason, updated, url, type: notification.notification.subject.type };
}

async function main() {
  const token = getToken();
  if (!token) {
    console.error("Missing GitHub token. Provide via --token <token> or GITHUB_TOKEN/GH_TOKEN env var.");
    process.exit(1);
  }

  const format = parseFormat();

  const [notifications, pullRequests, issues] = await Promise.all([fetchNotifications({ token }), fetchPullRequests(), fetchIssues()]);
  if (!notifications) {
    console.error("Failed to fetch notifications (no data returned).");
    process.exit(1);
  }

  const aggregated = await processNotifications(notifications, pullRequests ?? [], issues ?? [], token);
  if (!aggregated || aggregated.length === 0) {
    console.log("No notifications after filtering.");
    return;
  }

  const sorted = sortIssuesController(aggregated);
  const rows = sorted.map(toRow);

  if (format === "json") {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const lines = rows.map((row, idx) => {
    const priority = row.priority ? `[P:${row.priority}] ` : "";
    return `${idx + 1}. ${priority}${row.repo} — ${row.title} (${row.type})\n    reason: ${row.reason || "-"} | updated: ${row.updated}\n    url: ${row.url}`;
  });
  console.log(lines.join("\n\n"));
}

void main().catch((err) => {
  console.error("CLI error:", err);
  process.exit(1);
});
