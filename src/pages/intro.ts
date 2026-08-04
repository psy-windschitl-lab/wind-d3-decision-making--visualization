import type { Page } from "../router";

type IntroVariant = {
  title: string;
  body: string;
};

export const INTRO_VARIANTS: Record<string, IntroVariant> = {
  intro1: {
    title: `Welcome to <i>Decide Wisely</i>`,
    body: `
      <div style="font-size:1.15em">
        <p>This app doesn't make a decision for you, but it helps you make your own decision -- wisely!</p>
        <p>You start by identifying your options and answering simple questions, while the app builds a visual representation called a layout. The layout helps spot which option is best using either your own intuition or an optimized decision-making rule.</p>
      </div>
    `,
  },
  intro2: {
    title: "Placeholder for Instructions for a research version",
    body: `
      <p style="color:var(--muted)">
        <i>Note: this placeholder needs further refinement depending on what the study is
        doing and whether it's using a wizard, manual, table, or vanilla version, and on
        the WADD setting.</i>
      </p>
      <p>The instructions might be simple, like this:</p>
      <p>There are four main stages to build your layout.</p>
      <p>1. Specify your options</p>
      <p>2. Specify factors that could matter</p>
      <p>3. Rate option on each factor</p>
      <p>4. Rate the importance of each factor</p>
      <p>After that you'll see a visual representation&hellip;</p>
    `,
  },
};

export const GP_MORE_INFO_TITLE = "More Introductory Information";
export const GP_MORE_INFO_BODY = `
  <p>This is a placeholder for additional introductory information. We&rsquo;ll add it later.</p>
`;

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
  onContinue: () => void
) {
  const renderMain = () => {
    root.replaceChildren();
    const section = document.createElement("section");
    section.className = "card";
    section.innerHTML = `
      <h1 class="h1">${variant.title}</h1>
      ${variant.body}
      <p>&nbsp;</p>
      <div style="display:flex; gap:.5rem; margin-top:16px; flex-wrap:wrap">
        <button id="introContinueBtn" style="padding:.5rem .8rem; border-radius:.5rem; border:none; background:var(--accent); color:white">
          ${introKey === "intro1"
            ? `Get Started on a Decision Now<br><span style="font-size:0.75em; font-weight:400">(app works on desktops/laptops only)</span>`
            : "Continue"}
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
      <h1 class="h1">${GP_MORE_INFO_TITLE}</h1>
      ${GP_MORE_INFO_BODY}
      <div style="display:flex; gap:.5rem; margin-top:16px; flex-wrap:wrap">
        <button id="introBackBtn">Back</button>
        <button id="introContinueBtn2" style="padding:.5rem .8rem; border-radius:.5rem; border:none; background:var(--accent); color:white">
          Get Started on a Decision Now<br><span style="font-size:0.75em; font-weight:400">(app works on desktops/laptops only)</span>
        </button>
      </div>
    `;
    root.appendChild(section);
    section.querySelector<HTMLButtonElement>("#introBackBtn")!.onclick = renderMain;
    section.querySelector<HTMLButtonElement>("#introContinueBtn2")!.onclick = onContinue;
  };

  renderMain();
}

export type { Page };
