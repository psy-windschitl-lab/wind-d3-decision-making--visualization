export function renderPostDecisionLanding(root: HTMLElement, isGP1: boolean) {
  root.replaceChildren();
  const section = document.createElement("section");
  section.className = "card";
  section.innerHTML = `
    <h1 class="h1">
      Placeholder for what they see in the ${isGP1 ? "GP1" : "research"} version after
      they&rsquo;ve hit next.
    </h1>
  `;
  root.appendChild(section);
}
