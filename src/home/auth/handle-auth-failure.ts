import { clearStoredSession } from "../getters/get-github-access-token";
import { toolbar } from "../ready-toolbar";
import * as githubLogin from "../rendering/render-github-login-button";

let isHandlingAuthFailure = false;

export async function handleAuthFailure(reason?: string) {
  if (isHandlingAuthFailure) return;
  isHandlingAuthFailure = true;

  try {
    console.warn("Detected auth failure, signing out", reason ?? "");

    try {
      clearStoredSession();
    } catch (error) {
      console.warn("Failed to clear stored session", error);
    }

    try {
      const supabase = githubLogin.getSupabase();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.warn("Supabase sign-out failed", error);
    }

    if (typeof document !== "undefined") {
      const authElement = document.getElementById("authentication");
      if (authElement) {
        const authenticated = authElement.querySelector("#authenticated");
        if (authenticated) authenticated.remove();
        const loginButton = authElement.querySelector("#github-login-button");
        if (loginButton) loginButton.remove();
      }
      githubLogin.renderGitHubLoginButton();
      if (toolbar) {
        toolbar.removeAttribute("data-authenticated");
      }
    }
  } finally {
    isHandlingAuthFailure = false;
  }
}
