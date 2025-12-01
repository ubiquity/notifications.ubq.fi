# Notifications CLI Testing Notes

- Use the CLI to exercise the notification pipeline without the UI: `GITHUB_TOKEN=<pat> npm run --silent notifications:cli` (or `npm run --silent notifications:cli -- --json` for JSON). You can also pass `--token <pat>`.
- The CLI reuses `fetchNotifications`/`processNotifications`; it fetches missing issues/PRs directly from GitHub to resolve priority labels. If partner JSON feeds lack an item, the CLI still works because it pulls the issue via REST.
- Mark-as-read is disabled off the `ubq.fi` domain by default; the CLI never marks anything read. UI auto-mark can be toggled via `flipAutoMarkNotifications()` in the browser console.
- DOM-dependent modules are guarded for non-browser contexts, so running via `npm run notifications:cli` should not require a DOM or Supabase env vars (token is mandatory).
- Priority labels: matched case-insensitively on `priority: <value>` from linked issues. PRs resolve their issue via body keywords (Resolves/Closes/Fixes) or same-number fallback; CLI output shows the priority chip value.
