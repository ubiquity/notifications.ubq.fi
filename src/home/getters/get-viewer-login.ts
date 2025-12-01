import { getGitHubUserName } from "./get-github-access-token";

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
