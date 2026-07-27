import type { Page } from "../router";

type IntroVariant = {
  title: string;
  body: (layoutKey: string, waddKey: string) => string;
};

// --- GP (Intro1) -----------------------------------------------------------

const GP_MORE_INFO_BODY = `
  <p>Placeholder for additional GP introductory information. Add whatever extra detail
  GP participants specifically should see here (e.g. more on how the Layout works, or
  what to expect at each stage) before they start.</p>
`;

// --- Research (Intro2) - varies by the actual layout/wadd in play ----------

function researchStagesHtml(layoutKey: string): string {
  if (layoutKey === "manual") {
    return `
      <p>
        In this version, you build everything directly within the visual layout itself -
        there's no separate step-by-step wizard. You'll add your options and factors,
        rate each option on each factor, and set each factor's importance, all within the
        same visual layout.
      </p>
    `;
  }

  const isLive = layoutKey === "vanilla" || layoutKey === "gp1";
  const isTable = layoutKey === "table";
  const revealLine = isLive
    ? "The layout will update live as you go, so you'll see it build as you complete each stage."
    : isTable
      ? "After that, you'll see a table summarizing your ratings."
      : "After that, you'll see a visual representation (a Layout) summarizing your ratings.";

  return `
    <p>There are four main stages to build your layout.</p>
    <p>1. Specify your options</p>
    <p>2. Specify factors that could matter</p>
    <p>3. Rate each option on each factor</p>
    <p>4. Rate the importance of each factor</p>
    <p>${revealLine}</p>
  `;
}

function researchWaddLine(waddKey: string): string {
  if (waddKey === "off") return "The overall WADD score for each option will not be shown.";
  if (waddKey === "on") return "The overall WADD score for each option will always be visible.";
  return "You'll have the option to reveal the overall WADD score for each option, once it's available.";
}

export const INTRO_VARIANTS: Record<string, IntroVariant> = {
  intro1: {
    title: "Welcome to the Decide Wisely App! (Desktop/Laptop Version)",
    body: () => `
      <p>This app doesn't make a decision for you, but it helps you understand and make your own decision (wisely!).</p>
      <p>You start by identifying your options and answering simple questions, while the app builds an organized visual representation called a Layout. The Layout helps spot which option is best using either your own intuition or an optimized decision-making rule.</p>
      <p>You can also change your inputs to see the implications for your decision making.</p>
    `,
  },
  intro2: {
    title: "Placeholder for Instructions for a research version",
    body: (layoutKey, waddKey) => `
      ${researchStagesHtml(layoutKey)}
      <p>${researchWaddLine(waddKey)}</p>
    `,
  },
};

export function resolveIntroVariant(introParam: string | null) {
  const key = (introParam || "").toLowerCase();
  return key in INTRO_VARIANTS ? { key, variant: INTRO_VARIANTS[key] } : null;
}

// Renders the intro panel; onContinue is called (no navigation, no URL change) once the
// person is ready to proceed into the actual tool.
export function renderIntroPanel(
  root: HTMLElement,
  introKey: string,
  variant: IntroVariant,
  layoutParam: string,
  waddParam: string,
  onContinue: () => void
) {
  const layoutKey = layoutParam.toLowerCase();
  const waddKey = waddParam.toLowerCase();

  const renderMain = () => {
    root.replaceChildren();
    const section = document.createElement("section");
    section.className = "card";
    section.innerHTML = `
      <h1 class="h1">${variant.title}</h1>
      ${variant.body(layoutKey, waddKey)}
      <div style="display:flex; gap:.5rem; margin-top:16px; flex-wrap:wrap">
        <button id="introContinueBtn" style="padding:.5rem .8rem; border-radius:.5rem; border:none; background:var(--accent); color:white">
          ${introKey === "intro1" ? "Get Started on a Decision now" : "Continue"}
        </button>
        ${introKey === "intro1" ? `<button id="introMoreBtn">See More Introductory Information</button>` : ""}
      </div>
    `;
    root.appendChild(section);
    section.querySelector<HTMLButtonElement>("#introContinueBtn")!.onclick = onContinue;
    const moreBtn = section.querySelector<HTMLButtonElement>("#introMoreBtn");
    if (moreBtn) moreBtn.onclick = renderMoreInfo;
  };

  const renderMoreInfo = () => {
    root.replaceChildren();
    const section = document.createElement("section");
    section.className = "card";
    section.innerHTML = `
      <h1 class="h1">More Introductory Information</h1>
      ${GP_MORE_INFO_BODY}
      <div style="display:flex; gap:.5rem; margin-top:16px; flex-wrap:wrap">
        <button id="introBackBtn">Back</button>
        <button id="introContinueBtn2" style="padding:.5rem .8rem; border-radius:.5rem; border:none; background:var(--accent); color:white">Get Started on a Decision now</button>
      </div>
    `;
    root.appendChild(section);
    section.querySelector<HTMLButtonElement>("#introBackBtn")!.onclick = renderMain;
    section.querySelector<HTMLButtonElement>("#introContinueBtn2")!.onclick = onContinue;
  };

  renderMain();
}

export type { Page };
