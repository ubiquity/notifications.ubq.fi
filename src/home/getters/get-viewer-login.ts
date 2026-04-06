import { getGitHubUserName } from "./get-github-access-token";
import { handleAuthFailure } from "../auth/handle-auth-failure";

export async function resolveViewerLogin(providerToken: string | null): Promise<string | null> {
  let cachedLogin: string | null = null;
  try {
    cachedLogin = typeof localStorage !== "undefined" ? getGitHubUserName() : null;
  } catch {
    cachedLogin = null;
  }
  if (cachedLogin) return cachedLogin.toLowerCase();
  if (!providerToken) return null;

  try {
    const response = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${providerToken}`, "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        await handleAuthFailure("resolveViewerLogin");
      }
      console.warn("Failed to resolve viewer login", response.status);
      return null;
    }
    const data: { login?: string } = await response.json();
    return data.login ? data.login.toLowerCase() : null;
  } catch (error) {
    console.warn("Error resolving viewer login", error);
    return null;
  }
}
