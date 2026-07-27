import type { Page } from "../router";

// Shared body text for now - update per-variant once the two versions should actually
// say different things.
const SHARED_BODY = `
  <p>This tool helps people make decisions when there are many options, many factors to consider, and they all matter to different extents for every individual. One example might be how to choose which apartment is best for you from several options, but this can apply to almost any tough decision.</p>
  <p>There are three main stages to build your layout.</p>
  <p>1. You specify your different options</p>
  <p>2. You determine what factors to consider and which are the most important to you.</p>
  <p>3. Use the built layout to guide your decision.</p>
  <p style="color:var(--muted); font-size:0.9em">Best used on a desktop or laptop browser.</p>
`;

export const INTRO_VARIANTS: Record<string, { title: string; body: string }> = {
  intro1: {
    title: "Placeholder for Instructions for the GP versions",
    body: SHARED_BODY,
  },
  intro2: {
    title: "Placeholder for Instructions for a research version",
    body: SHARED_BODY,
  },
};

export function resolveIntroVariant(introParam: string | null) {
  const key = (introParam || "").toLowerCase();
  return INTRO_VARIANTS[key] ?? null;
}

// Renders the intro panel with a Continue button; onContinue is called (no navigation,
// no URL change) once the person is ready to proceed into the actual tool.
export function renderIntroPanel(
  root: HTMLElement,
  variant: { title: string; body: string },
  onContinue: () => void
) {
  const section = document.createElement("section");
  section.className = "card";
  section.innerHTML = `
    <h1 class="h1">${variant.title}</h1>
    ${variant.body}
    <button id="introContinueBtn" style="margin-top:12px; padding:.5rem .8rem; border-radius:.5rem; border:none; background:var(--accent); color:white">Continue</button>
  `;
  root.appendChild(section);
  section.querySelector<HTMLButtonElement>("#introContinueBtn")!.onclick = onContinue;
}

export type { Page };
