import { renderErrorInModal } from "../rendering/display-popup-modal";

// Generic key-based storage helper for strongly-typed reads
export function getLocalStore<T = unknown>(key: string): T | null {
  const cachedIssues = localStorage.getItem(key);
  if (cachedIssues) {
    try {
      const value = JSON.parse(cachedIssues) as T;
      return value;
    } catch (error) {
      renderErrorInModal(error as Error, "Failed to parse cached issues from local storage");
    }
  }
  return null;
}

export function setLocalStore<T>(key: string, value: T) {
  // remove state from issues before saving to local storage
  localStorage[key] = JSON.stringify(value);
}
