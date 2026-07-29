export function renderPostDecisionLanding(root: HTMLElement) {
  root.replaceChildren();
  const section = document.createElement("section");
  section.className = "card";
  section.innerHTML = `
    <h1 class="h1">
      We hope you found the app useful. This page is a placeholder for what a user would
      see after they&rsquo;ve hit &ldquo;next.&rdquo; Full contents of the page are TBD.
    </h1>
  `;
  root.appendChild(section);
}
