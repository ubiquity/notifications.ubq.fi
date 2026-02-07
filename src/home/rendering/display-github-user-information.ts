import { GitHubUser } from "../github-types";
import { toolbar } from "../ready-toolbar";
import { renderErrorInModal } from "./display-popup-modal";
import * as githubLogin from "./render-github-login-button";

export async function displayGitHubUserInformation(gitHubUser: GitHubUser) {
  const authenticatedDivElement = document.createElement("div");
  authenticatedDivElement.id = "authenticated";
  authenticatedDivElement.classList.add("user-container");
  if (!toolbar) throw new Error("toolbar not found");
  if (!githubLogin.authenticationElement) throw new Error("authentication element not found");

  const img = document.createElement("img");
  if (gitHubUser.avatar_url) {
    img.src = gitHubUser.avatar_url;
  } else {
    img.classList.add("github-avatar-default");
  }
  img.alt = gitHubUser.login;

  // const divNameElement = document.createElement("div");

  // // Falls back to login because the name is not required for a GitHub user
  // divNameElement.textContent = gitHubUser.name || gitHubUser.login;
  // divNameElement.classList.add("full");
  // authenticatedDivElement.appendChild(divNameElement);
  authenticatedDivElement.appendChild(img);

  authenticatedDivElement.addEventListener("click", async function signOut() {
    const supabase = githubLogin.getSupabase();
    if (!supabase) {
      renderErrorInModal(new Error("Supabase client unavailable"), "Error logging out");
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      renderErrorInModal(error, "Error logging out");
      return;
    }
    window.location.replace("/");
  });

  githubLogin.authenticationElement.appendChild(authenticatedDivElement);
  toolbar.setAttribute("data-authenticated", "true");
  toolbar.classList.add("ready");
}
