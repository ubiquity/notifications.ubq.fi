Goal & Scope

- Replace Node/Yarn/Jest workflow with Bun as the runtime, package manager, and test runner.
- Keep esbuild plugins and current build outputs; run them via Bun.
- Update CI to use Bun for install, lint, test (with coverage/JUnit), and build. Keep Cloudflare deployment flow via artifact.

Key Outcomes

- One lockfile: bun.lockb (commit it; remove Yarn/PNP files).
- One runner: bun for dev, test, lint, build, and release.
- Tests run via bun test with happy‑dom, coverage, and JUnit output.
- CI workflows use oven-sh/setup-bun@v2 and cache Bun’s global package cache.

Repository Changes

- Remove Yarn PnP artifacts and lock:
  - Delete: .pnp.cjs, .pnp.loader.mjs, .yarn/, yarn.lock.
- Commit Bun lockfile:
  - Keep/regen bun.lockb.
- Engines and versions in package.json:1:
  - Replace Node engine with Bun engine:
    - "engines": { "bun": ">=1.1.0" }
  - Optional: add .bun-version at repo root (e.g., 1.1.x) for reproducible installs locally and in CI.
- Scripts in package.json:1:
  - Replace tsx with Bun runtime:
    - "dev": "bun build/esbuild-server.ts"
    - "start": "bun build/esbuild-server.ts"
    - "build": "bun build/esbuild-build.ts"
  - Keep lint/format/cspell/knip scripts; they work via bun run ... and resolve from node_modules/.bin.
  - Add a no‑fix lint for CI:
    - "lint": "eslint . --max-warnings=0"
    - "format:check": "prettier --check ."
- Add Bun config bunfig.toml (new file) to drive test runner:
  - Preload DOM, set JUnit path, enable coverage, optional thresholds. See example below.
- Tests migration (Jest ➜ bun:test):
  - Remove Jest config and deps: jest, ts-jest, @types/jest, jest-environment-jsdom, jest-localstorage-mock, jest-junit, jest-md-dashboard, jest-util.
  - Replace dotenv/config with Bun’s automatic .env loading.
  - Switch to bun:test APIs (describe/test/expect stay; replace jest.fn with mock() or manual mocks).
  - Use happy‑dom for DOM APIs (via preload). Keep fake-indexeddb if needed.
  - Update tests/setup-env.ts:1 to remove jest.fn() and rely on bun’s mock() or manual stubs (example inline below).
- Keep esbuild, run under Bun:
  - esbuild stays as a devDependency.
  - build/esbuild-build.ts:1 uses dotenv today; Bun autoloads .env, so dotenv call is optional. You can remove it in a follow‑up.

bunfig.toml (add this at repo root)

- File: bunfig.toml:1

```
[test]
preload = ["./tests/happydom-setup.ts", "./tests/setup-env.ts"]
coverage = true
coverageDir = "./coverage"
# Uncomment if you want to enforce minimums:
# coverageThreshold = { lines = 0.8, functions = 0.8, statements = 0.8 }
timeout = 10000

[test.reporter]
junit = "./junit.xml"
```

happy-dom preload (new)

- File: tests/happydom-setup.ts:1

```
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
```

Adjust tests/setup-env.ts

- Replace Jest‑specific mocks with Bun mocks or manual stubs. Example revision for tests/setup-env.ts:1:

```
import { afterEach, mock } from "bun:test";

// Only set DOM if available (happy-dom preload provides document/window)
if (typeof document !== "undefined") {
  document.body.innerHTML = `
    <div id="toolbar"></div>
    <div id="modal" class="modal">
      <div class="modal-content">
        <h2 id="modal-title"></h2>
        <p id="modal-body"></p>
        <a id="modal-anchor" href=""></a>
      </div>
      <div class="modal-toolbar">
        <button class="close-preview"></button>
      </div>
    </div>
    <div id="preview-modal" class="modal">
      <button class="close-preview"></button>
    </div>
    <a id="preview-title-anchor"></a>
    <h1 id="preview-title"></h1>
    <div id="preview-body-inner"></div>
    <div id="bottom-bar"></div>
    <div id="issues-container"></div>
    <div id="notifications"></div>
  `;
}

// IntersectionObserver mock
globalThis.IntersectionObserver = class IntersectionObserver {
  root: Element | null = null;
  rootMargin = "";
  thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
} as any;

// DOMParser mock (minimal)
globalThis.DOMParser = class DOMParser {
  parseFromString(str: string, contentType: string) {
    const doc = { body: { children: contentType === "text/html" && str.includes("<") ? [{}] : [] } };
    return doc as any;
  }
} as any;

// fetch mock (bun:test mock or manual)
export const fetchMock = mock(() => Promise.resolve({ json: async () => ({}) })) as unknown as typeof fetch;
globalThis.fetch = fetchMock as any;
afterEach(() => (fetchMock as any).mockReset?.());

// URL.createObjectURL mock
globalThis.URL.createObjectURL = (() => "blob://mock") as any;

// structuredClone polyfill
globalThis.structuredClone = ((obj: any) => JSON.parse(JSON.stringify(obj))) as any;
```

CI Workflows (Bun)

- Build (replaces Node/Yarn)
  - .github/workflows/build.yml:1
    - Uses oven-sh/setup-bun@v2 with caching.
    - Runs bun ci, lint, typecheck, bun test (JUnit + coverage), then bun run build.
    - Uploads junit.xml, coverage/, and static/ artifact.
- Deploy (unchanged trigger)
  - .github/workflows/deploy.yml:1 remains; it already triggers on workflow “Build”.
  - Replace hard-coded Supabase env in old Build with GitHub secrets.

Suggested build.yml content:

```
name: Build

on:
  push:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Cache Bun global cache
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: bun-cache-${{ runner.os }}-${{ hashFiles('bun.lockb') }}
          restore-keys: |
            bun-cache-${{ runner.os }}-

      - name: Set up Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies (CI)
        run: bun ci

      - name: Lint
        run: |
          bunx eslint . --max-warnings=0
          bunx prettier --check .
          bunx cspell "**/*"
      - name: Type check
        run: bunx tsc -p tsconfig.json --noEmit

      - name: Test (with JUnit + coverage)
        run: bun test
      - name: Upload JUnit report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: junit
          path: junit.xml
      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage

      - name: Build
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: bun run build

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: static
          path: static
```

File Cleanup (No Clutter)

- Delete Yarn/PnP artifacts:
  - .pnp.cjs, .pnp.loader.mjs, .yarn/ directory, yarn.lock
- Remove Node version pin:
  - .nvmrc
- Remove Jest-only config and committed outputs:
  - jest.config.json
  - junit.xml (commit isn’t needed; CI will generate this)
- Prune devDependencies no longer needed:
  - tsx, jest, ts-jest, @types/jest, jest-environment-jsdom, jest-localstorage-mock, jest-junit, jest-md-dashboard, jest-util, dotenv (optional)
- Add:
  - @happy-dom/global-registrator (dev)
- Keep:
  - esbuild, eslint/prettier, typescript, knip, husky, cspell, wrangler

Local Developer Flow

- Install Bun:
  - macOS: brew install oven-sh/bun/bun
  - or: curl -fsSL https://bun.sh/install | bash
- Commands:
  - Install: bun install (or bun ci in CI)
  - Dev server: bun run dev
  - Build: bun run build
  - Test: bun test
  - Lint: bun run lint or bunx eslint .
  - Format: bun run format or bunx prettier --write .
- Husky still runs via prepare script on bun install.

Validation Checklist

- bun install works cleanly; bun.lockb committed.
- bun run dev serves the site; bun run build outputs static/dist.
- bun test passes locally; JUnit (junit.xml) and coverage under coverage/ produced.
- CI “Build” workflow green on PR; deploy job consumes static artifact as before.
- Remove Yarn PnP files from repo and CI; no references to Yarn/Node toolchain remain.

Notes and Gotchas

- DOM tests: Bun doesn’t support jsdom; happy‑dom is the recommended approach via preload.
- Mocks: jest.fn isn’t available; use mock() from bun:test (experimental) or manual stubs as shown.
- Env: Bun autoloads .env; do not import dotenv/config in tests. For strict control, pass --env-file="" to disable autoload.
- Esbuild: keep using esbuild (Bun’s bundler doesn’t accept esbuild plugins). The current custom plugins remain supported.

Refs #13
