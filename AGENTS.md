# Notifications CLI Testing Notes

- Use the CLI to exercise the notification pipeline without the UI: `GITHUB_TOKEN=<pat> npm run --silent notifications:cli` (or `npm run --silent notifications:cli -- --json` for JSON). You can also pass `--token <pat>`.
- The CLI reuses `fetchNotifications`/`processNotifications`; it fetches missing issues/PRs directly from GitHub to resolve priority labels. If partner JSON feeds lack an item, the CLI still works because it pulls the issue via REST.
- Mark-as-read is disabled off the `ubq.fi` domain by default; the CLI never marks anything read. UI auto-mark on view has been removed to avoid accidental reads.
- DOM-dependent modules are guarded for non-browser contexts, so running via `npm run notifications:cli` should not require a DOM or Supabase env vars (token is mandatory).
- Priority labels: matched case-insensitively on `priority: <value>` from linked issues. PRs resolve their issue via body keywords (Resolves/Closes/Fixes) or same-number fallback; CLI output shows the priority chip value.

## Deno Deploy CI notes (2025-12-02)
- Inline the Deno deploy workflow in this repo to avoid reusable-workflow parse/access issues; it runs on `development`.
- Install Bun via the official script (not `oven-sh/setup-bun`) to sidestep cache/HTTP 400 failures on Actions.
- Include `static/**`, `serve.ts`, and `deno.json` in deployctl uploads; otherwise the entrypoint is missing on deploy.
- Build uses Supabase secrets at build time; runtime env not needed for the static server.
- Supabase values are shared across subdomain apps; pull `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the org-level secrets instead of defining repo-specific copies.
