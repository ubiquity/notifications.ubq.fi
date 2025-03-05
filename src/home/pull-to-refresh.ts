// Extend Window interface to include our custom property
declare global {
  interface Window {
    scrollTimeout: number;
  }
}

let startY = 0;
let currentY = 0;
const THRESHOLD = 100;
let isRefreshing = false;
let scrollDistance = 0;
let isMouseScrolling = false;

function createRefreshIndicator(): HTMLDivElement {
  const indicator = document.createElement("div");
  indicator.className = "pull-refresh-indicator";
  indicator.innerHTML = `
    <div class="pull-refresh-spinner"></div>
  `;
  document.body.appendChild(indicator);
  return indicator;
}

export function initPullToRefresh(onRefresh: () => Promise<void>) {
  const container = document.getElementById("issues-container");
  if (!container) return;

  const indicator = createRefreshIndicator();
  let isDragging = false;

  // Mouse wheel support
  container.addEventListener(
    "wheel",
    (e) => {
      if (container.scrollTop === 0 && e.deltaY < 0) {
        e.preventDefault();
        if (!isMouseScrolling) {
          isMouseScrolling = true;
          scrollDistance = 0;
        }
        scrollDistance = Math.min(scrollDistance - e.deltaY, THRESHOLD * 1.5);

        const progress = Math.min(scrollDistance / THRESHOLD, 1);
        indicator.style.transform = `translateY(${scrollDistance * 0.5}px)`;
        indicator.style.opacity = progress.toString();

        if (scrollDistance > THRESHOLD) {
          indicator.classList.add("ready");
        } else {
          indicator.classList.remove("ready");
        }

        // Clear the scroll timeout
        clearTimeout(window.scrollTimeout);

        // Set a new timeout
        window.scrollTimeout = setTimeout(async () => {
          isMouseScrolling = false;
          if (scrollDistance > THRESHOLD && !isRefreshing) {
            isRefreshing = true;
            indicator.classList.add("refreshing");

            try {
              await onRefresh();
            } finally {
              isRefreshing = false;
              indicator.classList.remove("refreshing", "ready");
            }
          }
          scrollDistance = 0;
          indicator.style.transform = "translateY(-100%)";
          indicator.style.opacity = "0";
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
        const progress = Math.min(distance / THRESHOLD, 1);
        indicator.style.transform = `translateY(${distance * 0.5}px)`;
        indicator.style.opacity = progress.toString();

        if (distance > THRESHOLD) {
          indicator.classList.add("ready");
        } else {
          indicator.classList.remove("ready");
        }
      }
    },
    { passive: false }
  );

  container.addEventListener("touchend", async () => {
    if (!isDragging || isRefreshing) return;
    isDragging = false;

    const distance = currentY - startY;
    if (distance > THRESHOLD) {
      isRefreshing = true;
      indicator.classList.add("refreshing");

      try {
        await onRefresh();
      } finally {
        isRefreshing = false;
        indicator.classList.remove("refreshing", "ready");
      }
    }
  });
}
