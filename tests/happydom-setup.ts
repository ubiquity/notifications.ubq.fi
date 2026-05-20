import { mock, spyOn, afterEach } from "bun:test";
import { Window } from "happy-dom";
import "fake-indexeddb/auto";

const window = new Window();
Object.assign(window, { SyntaxError });

Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLAnchorElement: window.HTMLAnchorElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLDivElement: window.HTMLDivElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  DOMParser: window.DOMParser,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
});

const mockedFunctions = new Set<{ mockRestore?: () => void; mockClear?: () => void }>();

function fn<T extends (...args: never[]) => unknown>(implementation?: T) {
  const mocked = mock(implementation ?? (() => undefined));
  mockedFunctions.add(mocked);
  return mocked;
}

function spy<T extends object, TKey extends keyof T>(object: T, methodName: TKey) {
  const mocked = spyOn(object, methodName as never);
  mockedFunctions.add(mocked);
  return mocked;
}

const jestCompat = {
  fn,
  mock(moduleId: string, factory: () => unknown = () => ({})) {
    return mock.module(moduleId, factory);
  },
  spyOn: spy,
  restoreAllMocks() {
    for (const mocked of mockedFunctions) {
      mocked.mockRestore?.();
      mocked.mockClear?.();
    }
    mockedFunctions.clear();
  },
};

Object.assign(globalThis, {
  jest: jestCompat,
  global: globalThis,
});

void mock.module("@supabase/supabase-js", () => ({
  createClient: fn(() => ({})),
}));

void mock.module("@octokit/rest", () => ({
  Octokit: class {
    request = fn(async () => ({ data: [] }));
  },
}));

void mock.module("@octokit/request-error", () => ({
  RequestError: class RequestError extends Error {
    status?: number;
  },
}));

afterEach(() => {
  mock.restore();
});
