# Deno Deploy Workflow Matrix

This document defines expected behavior for `.github/workflows/deploy.yml`.

## Design Goal

- Keep fork CI green (build validation without secrets)
- Preserve real production deploy only on canonical upstream

## Trigger/Behavior Matrix

### 1) Pull Request (any repo)
- Job `deploy` runs (dry-run build with placeholder env)
- Job `deploy-production` does not run

### 2) Push on any fork repository
- Job `deploy` runs (dry-run build)
- Job `deploy-production` does not run

### 3) Push on upstream repo (`ubiquity/notifications.ubq.fi`)
- Job `deploy` does not run
- Job `deploy-production` runs via reusable workflow

## Guardrails

- Do not reference `secrets.*` in job-level `if:` expressions where unavailable.
- Keep upstream-only deploy gate:

```yaml
if: github.event_name != 'pull_request' && github.repository == 'ubiquity/notifications.ubq.fi'
```

## Quick Triage

If `Deno Deploy` fails immediately with workflow-file errors:
1. Open run annotations first.
2. Validate `if:` expressions and reusable workflow call syntax.
3. Ensure fork paths avoid deploy secrets dependency.
