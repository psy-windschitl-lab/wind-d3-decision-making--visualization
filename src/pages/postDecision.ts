export function renderPostDecisionLanding(root: HTMLElement, isGP1: boolean) {
  root.replaceChildren();
  const section = document.createElement("section");
  section.className = "card";
  section.innerHTML = isGP1
    ? `<h1 class="h1">Placeholder for what they see in the GP1 version after they&rsquo;ve hit next.</h1>`
    : `<h1 class="h1">We hope you found the app useful. This page is a placeholder for what a user would see after they&rsquo;ve hit next. TBD.</h1>`;
  root.appendChild(section);
}
