import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

void mock.module("../src/home/ready-toolbar", () => ({
  toolbar: { scrollTo: mock() },
}));
void mock.module("../src/home/rendering/render-preview-modal", () => ({
  modal: document.getElementById("preview-modal"),
  modalBodyInner: document.getElementById("preview-body-inner"),
  titleAnchor: document.getElementById("preview-title-anchor"),
  titleHeader: document.getElementById("preview-title"),
}));

const { displayPopupMessage, renderErrorInModal } = await import("../src/home/rendering/display-popup-modal");
let consoleErrorSpy: ReturnType<typeof spyOn>;

describe("displayPopupMessage", () => {
  test("sets title and body, toggles error class", () => {
    displayPopupMessage({ modalHeader: "Test Title", modalBody: "Test Body", isError: true, url: "https://example.com" });
    expect(document.getElementById("preview-title")?.textContent).toBe("Test Title");
    expect(document.getElementById("preview-body-inner")?.innerHTML).toBe("Test Body");
    expect(document.getElementById("preview-modal")?.classList.contains("error")).toBe(true);
    expect(document.getElementById("preview-title-anchor")?.getAttribute("href")).toBe("https://example.com");
    expect(document.getElementById("preview-modal")?.classList.contains("active")).toBe(true);
    expect(document.body.classList.contains("preview-active")).toBe(true);
  });
});

describe("renderErrorInModal", () => {
  beforeEach(() => {
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("logs message and calls displayPopupMessage", () => {
    renderErrorInModal(new Error("Test error"), "Test info");
    expect(console.error).toHaveBeenCalledWith(new Error("Test error"));
    expect(document.getElementById("preview-title")?.textContent).toBe("Error");
    expect(document.getElementById("preview-body-inner")?.innerHTML).toBe("Test info");
  });

  test("handles undefined info", () => {
    renderErrorInModal(new Error("Test error"));
    expect(console.error).toHaveBeenCalledWith("Test error");
  });
});
