const toolbar = typeof document !== "undefined" ? document.getElementById("toolbar") : null;
export async function readyToolbar() {
  if (!toolbar) return;
  toolbar.classList.add("ready");
}
export { toolbar };
