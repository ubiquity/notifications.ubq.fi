import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

const modal = document.createElement("div");
modal.id = "preview-modal";
const modalBodyInner = document.createElement("div");
modalBodyInner.id = "preview-body-inner";
const titleAnchor = document.createElement("a");
titleAnchor.id = "preview-title-anchor";
const titleHeader = document.createElement("h1");
titleHeader.id = "preview-title";

function mountPopupFixture() {
  document.body.className = "";
  modal.className = "modal";
  modalBodyInner.innerHTML = "";
  titleAnchor.removeAttribute("href");
  titleHeader.textContent = "";
  modal.replaceChildren(titleAnchor, titleHeader, modalBodyInner);
  document.body.replaceChildren(modal);
}

mountPopupFixture();

void mock.module("../src/home/ready-toolbar", () => ({
  toolbar: { scrollTo: mock() },
}));
void mock.module("../src/home/rendering/render-preview-modal", () => ({
  modal,
  modalBodyInner,
  titleAnchor,
  titleHeader,
}));

const { displayPopupMessage, renderErrorInModal } = await import("../src/home/rendering/display-popup-modal");
let consoleErrorSpy: ReturnType<typeof spyOn>;

describe("displayPopupMessage", () => {
  beforeEach(() => {
    mountPopupFixture();
  });

  test("sets title and body, toggles error class", () => {
    displayPopupMessage({ modalHeader: "Test Title", modalBody: "Test Body", isError: true, url: "https://example.com" });
    expect(titleHeader.textContent).toBe("Test Title");
    expect(modalBodyInner.innerHTML).toBe("Test Body");
    expect(modal.classList.contains("error")).toBe(true);
    expect(titleAnchor.getAttribute("href")).toBe("https://example.com");
    expect(modal.classList.contains("active")).toBe(true);
    expect(document.body.classList.contains("preview-active")).toBe(true);
  });
});

describe("renderErrorInModal", () => {
  beforeEach(() => {
    mountPopupFixture();
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("logs message and calls displayPopupMessage", () => {
    const err = new Error("Test error");
    renderErrorInModal(err, "Test info");
    expect(console.error).toHaveBeenCalledWith(err);
    expect(titleHeader.textContent).toBe("Error");
    expect(modalBodyInner.innerHTML).toBe("Test info");
  });

  test("handles undefined info", () => {
    renderErrorInModal(new Error("Test error"));
    expect(console.error).toHaveBeenCalledWith("Test error");
  });
});
