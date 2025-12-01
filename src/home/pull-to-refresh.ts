// Extend Window interface to include our custom property
declare global {
  interface Window {
    scrollTimeout: number;
  }
}

const THRESHOLD = 100;
const MAX_PULL_DISTANCE = THRESHOLD * 1.5;
const REFRESH_VISUAL_HEIGHT = 64;

let startY = 0;
let currentY = 0;
let pullDistance = 0;
let isRefreshing = false;
let isMouseScrolling = false;

function resetIndicator(indicator: HTMLElement) {
  pullDistance = 0;
  indicator.style.height = "0px";
  indicator.style.opacity = "0";
  indicator.classList.remove("refreshing", "ready");
}

function updateIndicator(indicator: HTMLElement, distance: number) {
  const clamped = Math.min(distance, MAX_PULL_DISTANCE);
  const visualDistance = clamped * 0.6;
  const progress = Math.min(clamped / THRESHOLD, 1);

  indicator.style.height = `${visualDistance}px`;
  indicator.style.opacity = progress.toString();

  if (clamped > THRESHOLD) {
    indicator.classList.add("ready");
  } else {
    indicator.classList.remove("ready");
  }
}

function createRefreshIndicator(): HTMLElement {
  const indicator = document.createElement("aside");
  indicator.className = "pull-refresh-indicator";
  indicator.innerHTML = `
    <div class="pull-refresh-spinner"></div>
  `;
  return indicator;
}

async function triggerRefresh(indicator: HTMLElement, onRefresh: () => Promise<void>) {
  if (isRefreshing) return;
  isRefreshing = true;
  indicator.classList.add("refreshing");
  indicator.style.height = `${REFRESH_VISUAL_HEIGHT}px`;
  indicator.style.opacity = "1";

  try {
    await onRefresh();
  } finally {
    isRefreshing = false;
    indicator.classList.remove("refreshing", "ready");
    resetIndicator(indicator);
  }
}

export function initPullToRefresh(onRefresh: () => Promise<void>) {
  const container = document.getElementById("issues-container");
  if (!container) return;

  const existingIndicator = container.querySelector(".pull-refresh-indicator") as HTMLElement | null;
  const indicator = existingIndicator ?? createRefreshIndicator();
  if (!existingIndicator) {
    container.prepend(indicator);
  }

  let isDragging = false;

  // Mouse wheel support
  container.addEventListener(
    "wheel",
    (e) => {
      if (container.scrollTop === 0 && e.deltaY < 0) {
        e.preventDefault();
        if (!isMouseScrolling) {
          isMouseScrolling = true;
          pullDistance = 0;
        }
        pullDistance = Math.min(pullDistance - e.deltaY, MAX_PULL_DISTANCE);

        updateIndicator(indicator, pullDistance);

        // Clear the scroll timeout
        clearTimeout(window.scrollTimeout);

        // Set a new timeout
        window.scrollTimeout = setTimeout(async () => {
          isMouseScrolling = false;
          if (pullDistance > THRESHOLD) {
            await triggerRefresh(indicator, onRefresh);
          } else {
            resetIndicator(indicator);
          }
        }, 150) as unknown as number;
      }
    },
    { passive: false }
  );

  // Touch support
  container.addEventListener(
    "touchstart",
    (e) => {
      if (container.scrollTop === 0) {
        startY = e.touches[0].clientY;
        isDragging = true;
        pullDistance = 0;
      }
    },
    { passive: true }
  );

  container.addEventListener(
    "touchmove",
    (e) => {
      if (!isDragging || isRefreshing) return;

      currentY = e.touches[0].clientY;
      const distance = currentY - startY;

      if (distance > 0) {
        e.preventDefault();
        pullDistance = distance;
        updateIndicator(indicator, pullDistance);
      }
    },
    { passive: false }
  );

  container.addEventListener("touchend", async () => {
    if (!isDragging || isRefreshing) return;
    isDragging = false;

    if (pullDistance > THRESHOLD) {
      await triggerRefresh(indicator, onRefresh);
    } else {
      resetIndicator(indicator);
    }
  });
}
