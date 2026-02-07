import { Window } from "happy-dom";

// Provide a deterministic DOM for unit tests.
const window = new Window({ url: "https://example.test/" });

// happy-dom exposes a Window instance, but app/test code expects globals.
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  location: window.location,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
});

