import { afterEach, mock } from "bun:test";

function readStoredSession() {
  const stored = localStorage.getItem("sb-local-auth-token");
  return stored ? JSON.parse(stored) : null;
}

void mock.module("@supabase/supabase-js", () => ({
  createClient: mock(() => ({})),
}));

void mock.module("@octokit/rest", () => ({
  Octokit: class {
    request = mock(() => Promise.resolve({ data: [] }));
  },
}));

void mock.module("@octokit/request-error", () => ({
  RequestError: class RequestError extends Error {
    status?: number;

    constructor(message: string, status = 403) {
      super(message);
      this.status = status;
    }
  },
}));

void mock.module("../src/home/rendering/render-github-login-button", () => ({
  authenticationElement: document.getElementById("authentication"),
  checkSupabaseSession: mock(() => Promise.resolve(readStoredSession())),
  getSupabase: mock(() => null),
  gitHubLoginButton: document.createElement("button"),
  renderAugmentAccessButton: mock(() => null),
  renderGitHubLoginButton: mock(() => {}),
  renderGitRevision: mock(() => {}),
}));

Object.assign(globalThis, {
  GIT_REVISION: "test",
  NODE_ENV: "test",
  SUPABASE_ANON_KEY: "test",
  SUPABASE_STORAGE_KEY: "local",
  SUPABASE_URL: "test",
});

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
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(
    private readonly _callback: IntersectionObserverCallback = () => {},
    options?: IntersectionObserverInit
  ) {
    void options;
  }

  disconnect(): void {}
  observe(target: Element): void {
    this._callback([{ isIntersecting: true, target } as unknown as IntersectionObserverEntry], this);
  }
  unobserve(target: Element): void {
    void target;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// DOMParser mock (minimal)
class MockDOMParser implements DOMParser {
  parseFromString(str: string, contentType: DOMParserSupportedType): Document {
    if (typeof document !== "undefined") {
      const doc = document.implementation.createHTMLDocument("");
      if (contentType === "text/html" && str.includes("<")) {
        doc.body.innerHTML = str;
      }
      return doc;
    }

    const fallbackBody = { children: contentType === "text/html" && str.includes("<") ? [{} as Element] : [] };
    return { body: fallbackBody } as unknown as Document;
  }
}
globalThis.DOMParser = MockDOMParser as unknown as typeof DOMParser;

// Build a fresh response object per call so consumers cannot share mutable state.
function createFetchResponse(): Response {
  const headers = typeof Headers !== "undefined" ? new Headers() : ({} as unknown as Headers);
  const response = {
    ok: true,
    status: 200,
    statusText: "OK",
    headers,
    json: async () => ({}),
    text: async () => "",
    // clone() returns a genuinely new object with its own headers instead of a shared reference.
    clone: () => createFetchResponse(),
  };

  return response as unknown as Response;
}

// fetch mock to simulate fetch/json responses
export const fetchMock = mock(() => Promise.resolve(createFetchResponse())) as unknown as typeof fetch & {
  mockClear: () => void;
};
globalThis.fetch = fetchMock as unknown as typeof fetch;

afterEach(() => {
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

// URL.createObjectURL mock
globalThis.URL.createObjectURL = (() => "blob://mock") as typeof URL.createObjectURL;

// structuredClone polyfill
globalThis.structuredClone = <T>(obj: T) => JSON.parse(JSON.stringify(obj)) as T;
