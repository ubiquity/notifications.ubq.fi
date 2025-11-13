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

