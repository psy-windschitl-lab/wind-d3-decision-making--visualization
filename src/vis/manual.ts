import type { Page } from "../router";
import { DecisionLayoutChart, type Factor, type Option, type Scores } from "../lib/vis";
import { computeWaddScores } from "../lib/wadd";
import { attachDecisionWorkflow } from "../lib/decisionWorkflow";
import { renderPostDecisionLanding } from "../pages/postDecision";

export const meta = { name: "manual" };

type ChartState = {
  factors: Factor[];
  options: Option[];
  scores: Scores;
};

const ManualLayout: Page = (root, ctx) => {
  const waddSetting = ctx.query.get("wadd")?.toLowerCase();
  const waddMode = waddSetting === "on"
    ? "always"
    : waddSetting === "off"
      ? "never"
      : "checkbox";
  let showWADD = waddMode === "always";
  const waddControl = waddMode === "checkbox"
    ? `
      <label style="display:flex; align-items:center; gap:8px; color:var(--fg); margin-top:12px">
        <input type="checkbox" id="manualShowWADD"${showWADD ? " checked" : ""}> Show WADD Scores
      </label>
    `
    : "";
  const waddNoteHtml = `
    <div id="manualWaddNote" style="display:${showWADD ? "" : "none"}; margin-top:12px; padding:12px; border-radius:8px; background:rgba(232,238,252,0.06); line-height:1.5">
      <p style="margin:0 0 10px; font-size:1.6em; color:var(--fg); font-weight:700">
        The option with the highest WADD score (which is also the one with the most green)
        is the best one overall for you.
      </p>
      <p style="margin:0; font-size:0.9em; color:var(--muted)">
        The WADD score for an option is created by first weighing each of your evaluations
        about that option by factor importance, then adding up those weighted evaluations.
        Therefore, factors that you say are more important are given more influence in the
        WADD scores.
      </p>
    </div>
  `;

  const chartNoteHtml = `
    <div style="margin-top:12px; padding:12px; border-radius:8px; background:rgba(232,238,252,0.06); line-height:1.5">
      <p style="margin:0 0 10px; font-size:1.6em; color:var(--fg); font-weight:700">
        This visualizes your inputs. The more favorably you feel about an option&rsquo;s
        standing on a given factor, the more green (vs. brown) you should have it. And,
        the tallness of a row should reflect how important you think that factor is for
        your decision.
      </p>
      <p style="margin:0 0 10px; font-size:1.6em; color:var(--fg); font-weight:700">
        Now you can see how good an option is overall by looking at how much green
        appears in the column below it.
      </p>
      <p style="margin:0; font-size:0.9em; color:var(--muted)">
        This is all based on an optimized decision rule. The overall surface area in
        green under an option reflects how a decision algorithm called the WADD
        (weighted-additive) rule would score the overall utility of the option for you.
      </p>
    </div>
  `;

  root.innerHTML = `
    <section class="card">
      <h1 class="h1">Create Your Decision Layout</h1>
      <ul style="font-size:1.05em; margin:10px 0 0; padding-left:24px; line-height:1.6">
        <li>1--Double-click &ldquo;Option&rdquo; or &ldquo;Factor&rdquo; to rename them (optional)</li>
        <li>2--Click + to add more options or factors (optional)</li>
        <li>3--Click and drag from the middle of each gray box to start coloring the box to reflect your evaluation. For example, coloring it ALL green means you think that option is &ldquo;very good&rdquo; relative to others on that particular feature.</li>
        <li>4--Click and drag from the space right below a factor to adjust how important you think this factor should be for your decision.</li>
      </ul>
      <div id="manualViz" style="margin-top:12px; background:#0f1730; border-radius:12px; padding:8px;"></div>
      ${chartNoteHtml}
      ${waddControl}
      <div id="waddScoresWrap" style="display:${showWADD ? "" : "none"}; margin-top:12px"></div>
      ${waddNoteHtml}
    </section>
  `;

  const vizEl = root.querySelector<HTMLDivElement>("#manualViz")!;
  const manualWaddNote = root.querySelector<HTMLElement>("#manualWaddNote");
  const waddScoresWrap = root.querySelector<HTMLElement>("#waddScoresWrap")!;
  const decisionHost = document.createElement("div");
  root.appendChild(decisionHost);

  const state: ChartState = {
    options: [
      { id: "o1", label: "Option A", weight: 1 },
      { id: "o2", label: "Option B", weight: 1 },
    ],
    factors: [
      { id: "f1", label: "Factor 1", weight: 1 },
      { id: "f2", label: "Factor 2", weight: 1 },
    ],
    scores: {
      f1: { o1: 0, o2: 0 },
      f2: { o1: 0, o2: 0 },
    },
  };

  const showWADDCheckbox = waddMode === "checkbox"
    ? root.querySelector<HTMLInputElement>("#manualShowWADD")
    : null;

  const chart = new DecisionLayoutChart(vizEl, {
    width: 1100,
    height: 600,
    markCellsOnClick: true,
    onUpdate: (updates) => {
      if (updates.options) {
        syncCollection("options", updates.options);
      }
      if (updates.factors) {
        syncCollection("factors", updates.factors);
      }
      if (updates.scores) {
        for (const fid in updates.scores) {
          state.scores[fid] ??= {};
          Object.assign(state.scores[fid], updates.scores[fid]);
        }
      }
      reconcileScores();
      render();
    },
  });

  function syncCollection(key: "options" | "factors", incoming: Option[] | Factor[]) {
    const current = new Map(state[key].map(item => [item.id, item]));
    state[key] = incoming.map(item => {
      const existing = current.get(item.id);
      return existing
        ? Object.assign(existing, item)
        : { ...item };
    });
  }

  function reconcileScores() {
    const scores: Scores = {};
    state.factors.forEach((f) => {
      scores[f.id] = {};
      state.options.forEach((o) => {
        const current = state.scores[f.id]?.[o.id];
        scores[f.id][o.id] = typeof current === "number" ? current : 0;
      });
    });
    state.scores = scores;
  }

  function renderWaddScoresBlock() {
    const waddScores = computeWaddScores(
      state.options.map(o => ({ id: o.id, weight: o.weight })),
      state.factors.map(f => ({ id: f.id, weight: f.weight })),
      state.scores
    );
    const itemsHtml = state.options.map(o => `
      <div style="text-align:center">
        <div style="font-size:0.9em; color:var(--muted); font-weight:600">${o.label}</div>
        <div style="font-size:1.4em; font-weight:700; color:var(--fg)">${Math.round(waddScores[o.id])}</div>
      </div>
    `).join("");
    const labelHtml = waddMode === "always"
      ? `<h3 class="h1" style="font-size:1rem; margin:0 0 8px">WADD Scores</h3>`
      : "";
    waddScoresWrap.innerHTML = `${labelHtml}<div style="display:flex; gap:24px; flex-wrap:wrap">${itemsHtml}</div>`;
  }

  function render() {
    renderWaddScoresBlock();
    chart.data({
      options: state.options.map(o => ({ ...o })),
      factors: state.factors.map(f => ({ ...f })),
      scores: JSON.parse(JSON.stringify(state.scores)),
    }).render();
  }

  if (showWADDCheckbox) {
    showWADDCheckbox.addEventListener("change", () => {
      showWADD = !!showWADDCheckbox.checked;
      if (manualWaddNote) manualWaddNote.style.display = showWADD ? "" : "none";
      waddScoresWrap.style.display = showWADD ? "" : "none";
      render();
    });
  }

  const getDecisionData = () => {
    const waddScores = computeWaddScores(
      state.options.map(o => ({ id: o.id, weight: o.weight })),
      state.factors.map(f => ({ id: f.id, weight: f.weight })),
      state.scores
    );
    return {
      layoutName: root.parentElement?.dataset.layout ?? null,
      options: state.options.map(o => ({ id: o.id, label: o.label, weight: o.weight })),
      factors: state.factors.map(f => ({ id: f.id, label: f.label, weight: f.weight })),
      scores: JSON.parse(JSON.stringify(state.scores)) as Scores,
      waddScores,
    };
  };

  const bottomNextWrap = document.createElement("div");
  bottomNextWrap.style.display = "none";
  bottomNextWrap.style.textAlign = "center";
  bottomNextWrap.style.margin = "32px 0";
  const bottomNextBtn = document.createElement("button");
  bottomNextBtn.textContent = "Next";
  bottomNextBtn.style.fontSize = "1.4em";
  bottomNextBtn.style.padding = "14px 40px";
  bottomNextBtn.style.borderRadius = ".6rem";
  bottomNextBtn.style.border = "none";
  bottomNextBtn.style.background = "var(--accent)";
  bottomNextBtn.style.color = "white";
  bottomNextBtn.onclick = () => {
    renderPostDecisionLanding(root);
  };
  bottomNextWrap.appendChild(bottomNextBtn);
  root.appendChild(bottomNextWrap);

  attachDecisionWorkflow({
    host: decisionHost,
    getDecisionData,
    showWaddOnButtons: waddMode === "always",
    onRestart: () => location.reload(),
    onReturnToLayout: () => {
      bottomNextWrap.style.display = "";
    },
    onNext: () => {
      renderPostDecisionLanding(root);
    },
  });

  reconcileScores();
  render();
};

export default ManualLayout;
