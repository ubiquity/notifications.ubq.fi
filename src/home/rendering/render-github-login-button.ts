import { createClient } from "@supabase/supabase-js";
import { renderErrorInModal } from "./display-popup-modal";

declare const SUPABASE_URL: string; // @DEV: passed in at build time check build/esbuild-build.ts
declare const SUPABASE_ANON_KEY: string; // @DEV: passed in at build time check build/esbuild-build.ts
declare const NODE_ENV: string; // @DEV: passed in at build time check build/esbuild-build.ts
declare const GIT_REVISION: string; // @DEV: passed in at build time check build/esbuild-build.ts
declare const SUPABASE_STORAGE_KEY: string; // @DEV: passed in at build time check build/esbuild-build.ts

const envNode = typeof NODE_ENV !== "undefined" ? NODE_ENV : "production";
const hasSupabaseEnv = typeof SUPABASE_URL !== "undefined" && typeof SUPABASE_ANON_KEY !== "undefined";
const supabase = hasSupabaseEnv ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export function getSupabase() {
  return supabase;
}

export async function checkSupabaseSession() {
  // In testing mode, we directly read the storage since we cannot use Supabase for auth operations
  if (envNode === "test") {
    const storageKey = typeof SUPABASE_STORAGE_KEY !== "undefined" ? SUPABASE_STORAGE_KEY : "local";
    const stored = localStorage.getItem(`sb-${storageKey}-auth-token`);
    if (!stored) return null;
    return JSON.parse(stored);
  }

  if (!supabase) {
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}

async function gitHubLoginButtonHandler(scopes = "public_repo read:org notifications") {
  if (!supabase) {
    renderErrorInModal(new Error("Supabase client unavailable"), "Error logging in");
    return;
  }
  const redirectTo = window.location.href;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      scopes,
      redirectTo,
    },
  });
  if (error) {
    renderErrorInModal(error, "Error logging in");
  }
}

const hasDocument = typeof document !== "undefined";
const augmentAccessButton = hasDocument ? document.createElement("button") : (null as unknown as HTMLButtonElement);
export function renderAugmentAccessButton() {
  if (!hasDocument || !augmentAccessButton) return null;
  augmentAccessButton.id = "augment-access-button";
  augmentAccessButton.innerHTML = `<span title="Allow access to private repositories"><svg viewBox="0 0 24 24" class="svg-icon"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2m6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2m0 12H6V10h12z"></path></svg><span/>`;
  augmentAccessButton.addEventListener("click", () => gitHubLoginButtonHandler("repo read:org"));
  return augmentAccessButton;
}

const gitHubLoginButton = hasDocument ? document.createElement("button") : (null as unknown as HTMLButtonElement);
export const authenticationElement = hasDocument ? (document.getElementById("authentication") as HTMLDivElement) : null;
export function renderGitHubLoginButton() {
  if (!hasDocument || !gitHubLoginButton) return;
  gitHubLoginButton.id = "github-login-button";
  gitHubLoginButton.innerHTML = "<span>Login</span><span class='full'>&nbsp;With GitHub</span>";
  gitHubLoginButton.addEventListener("click", () => gitHubLoginButtonHandler());
  if (authenticationElement) {
    authenticationElement.appendChild(gitHubLoginButton);
    authenticationElement.classList.add("ready");
  }
}

export function renderGitRevision() {
  if (!hasDocument) return;
  const gitRevision = document.getElementById("git-revision") as HTMLAnchorElement;
  if (!gitRevision) return;
  gitRevision.href = `https://github.com/ubiquity/work.ubq.fi/commit/${GIT_REVISION}`;
  gitRevision.textContent = GIT_REVISION;
}

export { gitHubLoginButton };
