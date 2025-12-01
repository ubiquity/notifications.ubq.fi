const hasDocument = typeof document !== "undefined";
export const modal = hasDocument ? (document.getElementById("preview-modal") as HTMLDivElement) : (null as unknown as HTMLDivElement);
export const titleAnchor = hasDocument ? (document.getElementById("preview-title-anchor") as HTMLAnchorElement) : (null as unknown as HTMLAnchorElement);
export const titleHeader = hasDocument ? (document.getElementById("preview-title") as HTMLHeadingElement) : (null as unknown as HTMLHeadingElement);
export const modalBodyInner = hasDocument ? (document.getElementById("preview-body-inner") as HTMLDivElement) : (null as unknown as HTMLDivElement);
export const bottomBar = hasDocument ? (document.getElementById("bottom-bar") as HTMLDivElement) : (null as unknown as HTMLDivElement);
export const issuesContainer = hasDocument ? document.getElementById("issues-container") : null;

const closeButton = hasDocument ? (modal?.querySelector(".close-preview") as HTMLButtonElement) : null;

if (closeButton) {
  closeButton.addEventListener("click", closeModal);
}
if (hasDocument) {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

export function closeModal() {
  if (!hasDocument || !modal) return;
  modal.classList.remove("active");
  document.body.classList.remove("preview-active");
  issuesContainer?.classList.remove("keyboard-selection");
  bottomBarClearLabels();

  const newURL = new URL(window.location.href);
  newURL.searchParams.delete("issue");
  window.history.replaceState({}, "", newURL.toString());
}

export function bottomBarClearLabels() {
  if (!bottomBar) return;
  const existingClonedLabels = bottomBar.querySelector(".labels.cloned-labels");
  if (existingClonedLabels) {
    bottomBar.removeChild(existingClonedLabels);
  }
}
