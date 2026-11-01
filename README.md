# DevPool Directory UI

## Development Setup

Use Bun 1.3.4 or newer (the pinned version is in `.bun-version`). Bun runs the
development server, build scripts, CLI, and tests.

```sh
cp .env.example .env
```

Ensure that `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set. This is for GitHub user registration on login.

```sh
bun install
bun run dev
open http://localhost:8080
```

### Checks and production build

```sh
bun run lint
bun run typecheck
bun test
bun run build
```

Tests use `bun:test` with happy-dom preloaded via `bunfig.toml`. Each test run
writes a JUnit report to `junit.xml` and coverage reports to `coverage/`; these
generated files are ignored by Git. Use `bun ci` for a reproducible install from
the committed `bun.lockb` without updating dependencies.

To exercise notifications without the UI (requires a GitHub token):

```sh
bun run notifications:cli --json
```

Set `GITHUB_TOKEN` in your environment before running the CLI. It never marks
notifications as read.

### Automatic Light Mode

- There is a plugin (`build/plugins/invert-colors.ts`) that inverts the greyscale shades in `style.css` and outputs `inverted-style.css`.
- This plugin specifically seeks greyscale colors. Any colors with saturation are ignored.
- Any deliberate use of color (with saturation) should be added in `special.css` to not be processed.

## Features for End Users

- Login with GitHub to view issues locally
- Keyboard navigation (up/down arrows and escape/enter key)
- Sorting

### Screenshots

#### Desktop

![screenshot 4](https://github.com/ubiquity/devpool-directory-ui/assets/4975670/77dc4263-3837-47de-9924-e82fb571e8cc)
![screenshot 0](https://github.com/ubiquity/devpool-directory-ui/assets/4975670/7cf35a52-ef1d-4b8a-a29e-06e2adab2862)

#### Mobile

![screenshot 2](https://github.com/ubiquity/devpool-directory-ui/assets/4975670/b7861ce7-1f1f-49a9-b8e2-ebb20724ee67)

## Hosting

Production runs on Cloudflare Workers as the `notifications-ubq-fi` worker: the
built `static/` tree is deployed as static assets (see `wrangler.toml`) and the
zone route `notifications.ubq.fi/*` points at it. Deno Deploy is no longer used
(Deno Deploy shuts down in April 2027).

Build and deploy:

```sh
bun install
bun run build          # uses SUPABASE_URL and SUPABASE_ANON_KEY from the environment
bun run wrangler deploy
```
