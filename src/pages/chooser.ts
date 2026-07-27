import type { Page } from "../router";

// The three variables that can be set directly via URL for a specific version of the app
// (e.g. for sending a fixed link to a study participant), or chosen from this page when
// any of them is left out of the URL.
export const LAYOUT_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: "manual", label: "manual", description: "Build the layout yourself directly — no guided questions." },
  { value: "wizard", label: "wizard", description: "Answer guided questions first; the layout appears once you finish." },
  { value: "table", label: "table", description: "Answer guided questions first; a table appears once you finish, instead of a layout." },
  { value: "vanilla", label: "vanilla", description: "Answer guided questions; the layout updates live as you go, instead of appearing only at the end." },
  { value: "GP1", label: "GP1", description: "General Public 1 - a version intended for general-public participants, most similar to vanilla." },
];

export const WADD_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: "off", label: "off", description: "The option to reveal scores never appears." },
  { value: "checkbox", label: "checkbox", description: "A control to reveal scores appears once the layout or table appears." },
  { value: "on", label: "on", description: "Scores are always visible from the start — no control needed." },
];

export const INTRO_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: "Intro1", label: "Intro1", description: "For the GP (General Public) versions." },
  { value: "Intro2", label: "Intro2", description: "For a research version." },
];

export function renderVersionChooser(root: HTMLElement, ctx: Parameters<Page>[1]) {
  const section = document.createElement("section");
  section.className = "card";
  section.style.marginTop = "16px";
  section.innerHTML = `
    <h1 class="h1">Choose a Version</h1>
    <p style="color:var(--muted); margin-top:4px">
      Pick a value for each variable below, or use a link that already includes all three
      (e.g. <code>?layout=wizard&amp;wadd=off&amp;intro=Intro1</code>) to skip this page entirely
      and go straight to the intro panel for that version.
    </p>
    <p style="color:var(--muted); margin-top:4px">
      To skip the intro panel too and go straight into the tool itself, leave <code>intro</code>
      out of the link entirely (e.g. <code>?layout=wizard&amp;wadd=off</code>).
    </p>
    <p style="color:var(--muted); font-size:0.9em">Best used on a desktop or laptop browser.</p>
    <div style="margin-top:16px">
      <h2 class="h1" style="font-size:1.05rem">layout</h2>
      <p style="color:var(--muted); margin:2px 0 8px">Determines how the layout is built and revealed.</p>
      <div id="layoutOptions" style="display:flex; flex-direction:column; gap:8px"></div>
    </div>
    <div style="margin-top:16px">
      <h2 class="h1" style="font-size:1.05rem">wadd</h2>
      <p style="color:var(--muted); margin:2px 0 8px">Determines whether and when scores can be revealed.</p>
      <div id="waddOptions" style="display:flex; flex-direction:column; gap:8px"></div>
    </div>
    <div style="margin-top:16px">
      <h2 class="h1" style="font-size:1.05rem">intro</h2>
      <p style="color:var(--muted); margin:2px 0 8px">Determines which introduction/instructions page is shown.</p>
      <div id="introOptions" style="display:flex; flex-direction:column; gap:8px"></div>
    </div>
    <button id="startBtn" style="margin-top:16px" disabled>Start</button>
  `;
  root.appendChild(section);

  const layoutHost = section.querySelector<HTMLDivElement>("#layoutOptions")!;
  const waddHost = section.querySelector<HTMLDivElement>("#waddOptions")!;
  const introHost = section.querySelector<HTMLDivElement>("#introOptions")!;
  const startBtn = section.querySelector<HTMLButtonElement>("#startBtn")!;

  let selectedLayout: string | null = null;
  let selectedWadd: string | null = null;
  let selectedIntro: string | null = null;

  const updateStart = () => {
    startBtn.disabled = !(selectedLayout && selectedWadd && selectedIntro);
  };

  const renderOptionGroup = (
    host: HTMLDivElement,
    options: typeof LAYOUT_OPTIONS,
    groupName: string,
    onPick: (value: string) => void
  ) => {
    options.forEach(opt => {
      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "flex-start";
      label.style.gap = "8px";
      label.style.color = "var(--fg)";
      label.innerHTML = `
        <input type="radio" name="${groupName}" value="${opt.value}" style="margin-top:3px">
        <span><strong>${opt.label}</strong><br><span style="color:var(--muted); font-size:0.9em">${opt.description}</span></span>
      `;
      const input = label.querySelector("input")!;
      input.onchange = () => onPick(opt.value);
      host.appendChild(label);
    });
  };

  renderOptionGroup(layoutHost, LAYOUT_OPTIONS, "layoutChoice", (value) => {
    selectedLayout = value;
    updateStart();
  });
  renderOptionGroup(waddHost, WADD_OPTIONS, "waddChoice", (value) => {
    selectedWadd = value;
    updateStart();
  });
  renderOptionGroup(introHost, INTRO_OPTIONS, "introChoice", (value) => {
    selectedIntro = value;
    updateStart();
  });

  startBtn.onclick = () => {
    if (!selectedLayout || !selectedWadd || !selectedIntro) return;
    ctx.navigate(`/builder?layout=${selectedLayout}&wadd=${selectedWadd}&intro=${selectedIntro}`);
  };
}
