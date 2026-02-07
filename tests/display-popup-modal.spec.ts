import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { displayPopupMessage, renderErrorInModal } from "../src/home/rendering/display-popup-modal";

describe("displayPopupMessage", () => {
  it("sets title and body, toggles error class", () => {
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
  let errorSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy?.mockRestore();
    errorSpy = null;
  });

  it("logs message and renders modal", () => {
    const err = new Error("Test error");
    renderErrorInModal(err, "Test info");
    expect(console.error).toHaveBeenCalledWith(err);
    expect(document.getElementById("preview-title")?.textContent).toBe("Error");
    expect(document.getElementById("preview-body-inner")?.innerHTML).toBe("Test info");
  });

  it("handles undefined info", () => {
    const err = new Error("Test error");
    renderErrorInModal(err);
    expect(console.error).toHaveBeenCalledWith("Test error");
  });
});

