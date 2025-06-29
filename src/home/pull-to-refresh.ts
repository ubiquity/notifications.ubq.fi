// Extend Window interface to include our custom property
declare global {
  interface Window {
    scrollTimeout: number;
    pullRefreshRAF?: number;
  }
}

let startY = 0;
let currentY = 0;
const THRESHOLD = 120; // Increased threshold for better feel
const MAX_PULL = 200; // Maximum pull distance for resistance effect
let isRefreshing = false;
let scrollDistance = 0;
let isMouseScrolling = false;
let lastUpdateTime = 0;

// Calculate resistance based on pull distance
function calculateResistance(distance: number): number {
  if (distance <= THRESHOLD) {
    return distance;
  }
  const excess = distance - THRESHOLD;
  const resistanceFactor = 0.3; // How much resistance to apply
  return THRESHOLD + excess * resistanceFactor;
}

// Smooth animation frame-based updates
function updateIndicator(indicator: HTMLDivElement, distance: number, force = false) {
  const now = performance.now();
  if (!force && now - lastUpdateTime < 16) return; // 60fps throttling
  lastUpdateTime = now;

  const resistedDistance = calculateResistance(distance);
  const progress = Math.min(resistedDistance / THRESHOLD, 1);
  const pullProgress = Math.min(distance / MAX_PULL, 1);

  // Smooth transform with easing
  const transformY = resistedDistance * 0.5;
  const rotation = pullProgress * 360; // Rotate spinner based on pull

  indicator.style.transform = `translateY(${transformY}px)`;
  indicator.style.opacity = Math.min(progress * 1.2, 1).toString();

  const spinner = indicator.querySelector(".pull-refresh-spinner") as HTMLElement;
  if (spinner && !isRefreshing) {
    spinner.style.transform = `rotate(${rotation}deg) scale(${0.8 + progress * 0.4})`;
  }

  // Update classes for visual feedback
  if (distance > THRESHOLD && !indicator.classList.contains("ready")) {
    indicator.classList.add("ready");
    // Add subtle haptic feedback through animation
    indicator.style.animation = "pullReadyPulse 0.2s ease-out";
    setTimeout(() => {
      indicator.style.animation = "";
    }, 200);
  } else if (distance <= THRESHOLD && indicator.classList.contains("ready")) {
    indicator.classList.remove("ready");
  }
}

function resetIndicator(indicator: HTMLDivElement) {
  scrollDistance = 0;

  // Smooth reset animation
  indicator.style.transition = "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
  indicator.style.transform = "translateY(-100%)";
  indicator.style.opacity = "0";

  const spinner = indicator.querySelector(".pull-refresh-spinner") as HTMLElement;
  if (spinner) {
    spinner.style.transform = "rotate(0deg) scale(0.8)";
  }

  indicator.classList.remove("refreshing", "ready");

  // Remove transition after animation completes
  setTimeout(() => {
    indicator.style.transition = "";
  }, 300);
}

function createRefreshIndicator(): HTMLDivElement {
  const indicator = document.createElement("div");
  indicator.className = "pull-refresh-indicator";
  indicator.innerHTML = `
    <div class="pull-refresh-content">
      <div class="pull-refresh-spinner"></div>
      <div class="pull-refresh-text">Pull to refresh</div>
    </div>
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
        scrollDistance = Math.min(scrollDistance - e.deltaY, MAX_PULL);
        updateIndicator(indicator, scrollDistance);

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
          resetIndicator(indicator);
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
        updateIndicator(indicator, distance);
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

    resetIndicator(indicator);
  });
}
