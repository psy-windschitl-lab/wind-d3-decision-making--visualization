import type { Page } from "../router";
import { DecisionLayoutChart } from "../lib/vis";
import { computeWaddScores } from "../lib/wadd";
import { attachDecisionWorkflow } from "../lib/decisionWorkflow";
import { renderPostDecisionLanding } from "../pages/postDecision";
import { runLayoutTutorial } from "../lib/layoutTutorial";

type PreviewKind = "chart" | "table";

type BuilderConfig = {
  previewMode: "live" | "after-finish";
  kind: PreviewKind;
  // When true, the live preview chart is shown but not interactive, the chart-note and
  // WADD control are hidden, and the preview heading reads "PREVIEW of your layout" -
  // all until the person clicks Finish. Only meaningful when previewMode is "live".
  restrictPreviewUntilFinish?: boolean;
  // Controls how Step 4 asks its rating questions. Omit for the default: every option for
  // a factor grouped together under one shared scale legend at the top of the step.
  // "sequential" (GP3): one self-contained option/factor question at a time, e.g. "Think
  // about Option A (New York) on this factor: entertainment. How would you rate this
  // option on this factor?"
  // "sequentialWithFactorIntro" (GP4): like "sequential", but each factor first gets its
  // own two-line intro ("Think about this factor: entertainment. Your options might vary
  // ...") before its (shorter-worded) per-option questions.
  step4Style?: "sequential" | "sequentialWithFactorIntro";
};

type UIState = {
  decisionTopic: string;
  options: { id: string; label: string; identifier: string }[];
  factors: { id: string; label: string; uiImportance: number }[];
  scoresUI: Record<string, Record<string, number>>;
};

const MAX_CHOICES = 5;
const MAX_FACTORS = 12;
// A, B, C, ... for choice-option identifiers (n is 1-based).
const optionLetter = (n: number) => String.fromCharCode(64 + n);
const FACTOR_IDENTIFIER = "Factor";

// Builds a two-line header cell: the fixed identifier (small) above the person's
// own description (regular size) - used for option/choice columns.
function buildOptionHeaderCell(tag: "th" | "td", identifier: string, description: string): HTMLElement {
  const cell = document.createElement(tag);
  cell.style.maxWidth = "180px";
  const idLine = document.createElement("div");
  idLine.style.fontSize = "0.75em";
  idLine.style.color = "var(--muted)";
  idLine.style.fontWeight = "600";
  idLine.textContent = `Option ${identifier}`;
  const descLine = document.createElement("div");
  descLine.style.overflowWrap = "break-word";
  descLine.style.whiteSpace = "normal";
  descLine.textContent = description;
  cell.append(idLine, descLine);
  return cell;
}

// Builds an inline header cell: the fixed "Factor:" identifier (tiny) followed by the
// person's own description (regular size) on the same line - used for factor rows.
function buildFactorHeaderCell(tag: "th" | "td", description: string): HTMLElement {
  const cell = document.createElement(tag);
  cell.style.maxWidth = "220px";
  const idSpan = document.createElement("span");
  idSpan.style.fontSize = "0.7em";
  idSpan.style.color = "var(--muted)";
  idSpan.style.fontWeight = "600";
  idSpan.textContent = `${FACTOR_IDENTIFIER}: `;
  const descSpan = document.createElement("span");
  descSpan.style.overflowWrap = "break-word";
  descSpan.style.whiteSpace = "normal";
  descSpan.textContent = description;
  cell.append(idSpan, descSpan);
  return cell;
}

const mapLikertToSigned = (ui: number) => (ui - 3) / 2;

// A factor's weight is its importance rating divided by the sum of every
// factor's importance rating, so all weights for a given set of factors sum to 1
// (e.g. ratings 5, 3, 2 -> weights 0.5, 0.3, 0.2).
const computeNormalizedWeights = (
  factors: { id: string; uiImportance: number }[]
): Record<string, number> => {
  const total = factors.reduce((acc, f) => acc + Math.max(0, f.uiImportance), 0);
  const weights: Record<string, number> = {};
  factors.forEach(f => {
    weights[f.id] = total > 0 ? Math.max(0, f.uiImportance) / total : 0;
  });
  return weights;
};

const signedToLikert = (s: number) => Math.round(3 + s * 2);

export function createBuilderLayout(config: BuilderConfig): Page {
  return (root, ctx) => {
    // The layout-interpretation tutorial (and its replay link), the "YOUR Layout" reveal
    // page, and its related copy are, for now, a GP2/GP3/GP4-only touch - other layouts
    // sharing this same factory (wizard, GP1, etc.) are unaffected. root's parent is the
    // outer element LayoutBuilder.ts stamps with the resolved, lower-cased layout name
    // (see LayoutBuilder.ts's `root.dataset.layout = resolvedKey`).
    const layoutDataset = root.parentElement?.dataset.layout;
    const isGp2 = layoutDataset === "gp2" || layoutDataset === "gp3" || layoutDataset === "gp4";
    const supportsWADD = config.kind === "chart" || config.kind === "table";
    const waddSetting = ctx.query.get("wadd")?.toLowerCase();
    const waddMode = waddSetting === "on"
      ? "always"
      : waddSetting === "off"
        ? "never"
        : "checkbox";
    // For GP2, the "Show WADD Scores" toggle is the button embedded in gp2ChartNoteHtml
    // instead of this checkbox - other layouts keep the checkbox as before.
    const showWADDControl = supportsWADD && waddMode === "checkbox" && !isGp2
      ? `
        <div style="margin-bottom:12px">
          <label style="display:flex; align-items:center; gap:8px; color:var(--fg)">
            <input type="checkbox" id="showWADD"> Show WADD Scores
          </label>
        </div>
      `
      : "";

    const chartNoteHtml = config.kind === "chart"
      ? `
        <div style="margin-top:12px; padding:12px; border-radius:8px; background:rgba(232,238,252,0.06); line-height:1.5">
          <p style="margin:0 0 10px; font-size:1.6em; color:var(--fg); font-weight:700">
            This visualizes your inputs. The more favorably you rated an option on a factor,
            the more green (vs. brown) appears. And, the tallness of a row is based on how
            important you said that factor was.
          </p>
          <p style="margin:0 0 10px; font-size:1.6em; color:var(--fg); font-weight:700">
            Now you can see how good an option is overall by looking at how much green
            appears in the column below it.
          </p>
          <p style="margin:0 0 10px; font-size:0.9em; color:var(--muted)">
            This is all based on an optimized decision rule. The overall surface area in
            green under an option reflects how a decision algorithm called the WADD
            (weighted-additive) rule would score the overall utility of the option for you.
          </p>
        </div>
      `
      : "";

    // GP2-only version of chartNoteHtml: leads with the "find your best overall option"
    // takeaway, then a smaller indented reminder of what row height/color mean, then the
    // WADD-reveal button in the flow of the text instead of a separate checkbox above it.
    const gp2ChartNoteHtml = config.kind === "chart"
      ? `
        <div style="margin-top:12px; padding:12px; border-radius:8px; background:rgba(232,238,252,0.06); line-height:1.5">
          <p style="margin:0 0 14px; font-size:1.6em; color:var(--fg); font-weight:700">
            To find <strong>YOUR BEST OVERALL OPTION</strong>, look for the option with the
            most green under it.
          </p>
          <ul style="margin:0 0 14px 24px; padding-left:1.2em; font-size:1.1em; color:var(--fg); line-height:1.3">
            <li>Factors that you said were more important have taller rows</li>
            <li>More green versus brown in a box means you rated an option higher on that factor</li>
            <li>The overall amount of green under an option matches how an optimized decision rule would score the overall utility of the option for you.</li>
          </ul>
          ${waddMode === "always" ? "" : `
          <button id="showWaddBtn" type="button" style="background:transparent; border:1px solid rgba(232,238,252,0.25); color:var(--fg); border-radius:6px; padding:0.5rem 1rem; font-weight:600; cursor:pointer; font-size:1em">
            Show scores for the optimized decision rule (WADD Scores)
          </button>
          `}
        </div>
      `
      : "";

    // GP2-only version of waddNoteHtml: shorter headline, and the WADD explanation reuses
    // the same indent/size/color as the bullets above (gp2ChartNoteHtml) for consistency.
    const gp2WaddNoteHtml = config.kind === "chart"
      ? `
        <div id="waddNote" style="display:none; margin-top:12px; padding:12px; border-radius:8px; background:rgba(232,238,252,0.06); line-height:1.5">
          <p style="margin:0 0 10px; font-size:1.6em; color:var(--fg); font-weight:700">
            The option with the highest WADD score is best.
          </p>
          <p style="margin:0 0 0 24px; font-size:1.1em; color:var(--fg)">
            WADD stands for “weighted-additive.” WADD scores give more weight or influence
            to factors you said were more important.
          </p>
        </div>
      `
      : "";

    const waddMainSentence = config.kind === "table"
      ? "The option with the highest WADD score is best one overall."
      : "The option with the highest WADD score (which is also the one with the most green) is best one overall.";
    const waddNoteHtml = supportsWADD
      ? `
        <div id="waddNote" style="display:none; margin-top:12px; padding:12px; border-radius:8px; background:rgba(232,238,252,0.06); line-height:1.5">
          <p style="margin:0 0 10px; font-size:1.6em; color:var(--fg); font-weight:700">
            ${waddMainSentence}
          </p>
          <p style="margin:0; font-size:0.9em; color:var(--muted)">
            A WADD score for an option is created by first weighing each of your evaluations
            about that option by factor importance, then adding up those weighted evaluations.
            Therefore, factors that you say are more important are given more influence in the
            WADD scores.
          </p>
        </div>
      `
      : "";

    root.innerHTML = `
      <section id="wizardCard" class="card">
        <div id="step"></div>
        <div style="display:flex; gap:.5rem; margin-top:12px">
          <button id="backBtn" style="display:none">Back</button>
          <button id="nextBtn">Next</button>
        </div>
      </section>
      <section id="previewCard" class="card" style="margin-top:56px">
        <div id="previewHeadingRow" style="display:flex; align-items:center; gap:28px; flex-wrap:wrap">
          ${isGp2 ? `
          <button id="replayTutorialBtn" type="button" style="background:transparent; border:1px solid rgba(232,238,252,0.25); color:var(--fg); border-radius:6px; padding:0.4rem 0.8rem; font-weight:600; cursor:pointer; font-size:0.9em; white-space:nowrap">
            &#8249; Back to Julie's example
          </button>
          ` : ""}
          <div id="previewHeading">
            ${config.restrictPreviewUntilFinish
              ? `<h2 class="h1" style="font-size:2.2rem; margin-bottom:0">PREVIEW</h2><p style="color:var(--muted); margin-top:4px">of your layout</p>`
              : `<h2 class="h1" style="font-size:1.2rem">Summary of Your Information and Ratings</h2>`}
          </div>
          ${isGp2 ? `
          <button id="backToEntriesBtn" type="button" style="display:none; background:transparent; border:1px solid rgba(232,238,252,0.25); color:var(--fg); border-radius:6px; padding:0.4rem 0.8rem; font-weight:600; cursor:pointer; font-size:0.9em; white-space:nowrap">
            &#8249; Back to My Entries
          </button>
          ` : ""}
        </div>
        <div id="viz" style="margin-top:8px; background:#0f1730; border-radius:12px; padding:8px;"></div>
        <div id="chartNoteWrap" style="${config.restrictPreviewUntilFinish ? "display:none" : ""}">${isGp2 ? gp2ChartNoteHtml : chartNoteHtml}</div>
        <div id="waddControlWrap" style="${config.restrictPreviewUntilFinish ? "display:none" : ""}">${showWADDControl}</div>
        <div id="waddScoresWrap" style="display:none; margin-top:12px"></div>
        ${isGp2 ? gp2WaddNoteHtml : waddNoteHtml}
      </section>
    `;

    const stepHost = root.querySelector<HTMLDivElement>("#step")!;
    const backBtn = root.querySelector<HTMLButtonElement>("#backBtn")!;
    const nextBtn = root.querySelector<HTMLButtonElement>("#nextBtn")!;
    const vizEl = root.querySelector<HTMLDivElement>("#viz")!;
    vizEl.style.overflow = config.kind === "chart" ? "hidden" : "auto";
    const showWADDCheckbox = supportsWADD && waddMode === "checkbox"
      ? root.querySelector<HTMLInputElement>("#showWADD")
      : null;
    const previewCard = root.querySelector<HTMLElement>("#previewCard")!;
    const waddNote = root.querySelector<HTMLElement>("#waddNote");
    const waddScoresWrap = root.querySelector<HTMLElement>("#waddScoresWrap")!;
    const previewHeading = root.querySelector<HTMLElement>("#previewHeading")!;
    const chartNoteWrap = root.querySelector<HTMLElement>("#chartNoteWrap")!;
    const waddControlWrap = root.querySelector<HTMLElement>("#waddControlWrap")!;
    const wizardCard = root.querySelector<HTMLElement>("#wizardCard")!;
    const backToEntriesBtn = root.querySelector<HTMLButtonElement>("#backToEntriesBtn");
    root.querySelector<HTMLButtonElement>("#replayTutorialBtn")?.addEventListener("click", () => {
      runLayoutTutorial(() => {});
    });
    // GP2's layout reveal is its own "page" - reached by Finish, left by this. decisionHost
    // is declared further down (it's a plain created element, not part of root.innerHTML),
    // but this closure isn't invoked until a real click, by which point it exists - same
    // pattern already used by revealLayout below.
    const goBackToEntries = () => {
      wizardCard.style.display = "";
      previewCard.style.display = "none";
      decisionHost.style.display = "none";
      if (decisionIntroNote) decisionIntroNote.style.display = "none";
      window.scrollTo(0, 0);
    };
    backToEntriesBtn?.addEventListener("click", goBackToEntries);

    let showWADD = waddMode === "always";
    const updateWaddVisibility = () => {
      const visible = showWADD && (!config.restrictPreviewUntilFinish || reachedFinish);
      if (waddNote) waddNote.style.display = visible ? "" : "none";
      waddScoresWrap.style.display = visible ? "" : "none";
    };
    root.querySelector<HTMLButtonElement>("#showWaddBtn")?.addEventListener("click", () => {
      showWADD = !showWADD;
      updateWaddVisibility();
    });
    let finished = config.previewMode === "after-finish" ? false : true;
    // Separate from "finished" above, which is already true from the start for any
    // "live" preview mode (including GP1's) and so can't be used to mean "clicked
    // Finish." This one specifically tracks that click, for restrictPreviewUntilFinish.
    let reachedFinish = false;
    updateWaddVisibility();

    // Chart height is derived to precisely target a comfortable per-row height, by working
    // backward through the chart's own internal overhead (top/bottom margin, the optional
    // WADD row, and the gap between rows) - not an approximation. showAddControls is false
    // here, so no control-row space needs to be accounted for.
    const CHART_MARGIN_TOP = 92; // must match margin.top passed to the chart below
    const CHART_MARGIN_BOTTOM = 32; // matches the chart's default margin.bottom
    const CHART_ROW_GAP = 8; // matches the chart's default padding.row
    const TARGET_ROW_HEIGHT = 130;
    const computeChartHeight = (factorCount: number, waddVisible: boolean) =>
      Math.max(
        300,
        factorCount * (TARGET_ROW_HEIGHT + CHART_ROW_GAP) +
          CHART_MARGIN_TOP + CHART_MARGIN_BOTTOM +
          (waddVisible ? 36 : 0)
      );
    const INITIAL_FACTOR_COUNT = 2; // matches the starting state, before "state" itself exists yet
    const measureWidth = () => Math.max(360, vizEl.clientWidth || root.clientWidth || 960);

    let chart: DecisionLayoutChart | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const ensureChartSize = () => {
      if (!chart) return;
      chart.setSize(measureWidth(), computeChartHeight(state.factors.length, false));
    };

    if (config.kind === "chart") {
      chart = new DecisionLayoutChart(vizEl, {
        width: measureWidth(),
        height: computeChartHeight(INITIAL_FACTOR_COUNT, false),
        showAddControls: false,
        showIdentifierPrefix: true,
        allowImportanceDrag: false,
        readOnly: !!config.restrictPreviewUntilFinish && !reachedFinish,
        margin: { top: CHART_MARGIN_TOP },
        onScoreEdit: (fid, oid) => {
          touchedCells.add(cellKey(fid, oid));
        },
        onUpdate: (updates) => {
          if (updates.factors) {
            const idToFactor = new Map(state.factors.map(f => [f.id, f]));
            // Weights we last handed to the chart, before any of these updates are applied.
            // Used to turn a reported weight change (e.g. from dragging a row) into a
            // proportional change to that factor's own importance rating, since weight is
            // now relative to every factor's rating and can't be inverted on its own.
            const priorWeights = computeNormalizedWeights(state.factors);
            const nextImportanceFor = (newF: { id: string; weight: number }) => {
              const existing = idToFactor.get(newF.id);
              if (!existing) return 3; // sensible default for a brand-new factor
              const priorWeight = priorWeights[newF.id];
              if (!priorWeight) return existing.uiImportance;
              const ratio = newF.weight / priorWeight;
              return Math.max(1, Math.min(5, Math.round(existing.uiImportance * ratio)));
            };
            updates.factors.forEach(newF => {
              const existing = idToFactor.get(newF.id);
              const nextImportance = nextImportanceFor(newF);
              if (existing) {
                if (nextImportance !== existing.uiImportance) touchedImportance.add(existing.id);
                existing.label = newF.label;
                existing.uiImportance = nextImportance;
              } else {
                state.factors.push({
                  id: newF.id,
                  label: newF.label,
                  uiImportance: nextImportance,
                });
              }
            });
            state.factors = updates.factors.map(newF => idToFactor.get(newF.id) || {
              id: newF.id,
              label: newF.label,
              uiImportance: nextImportanceFor(newF),
            });
            pruneTouched();
          }
          if (updates.options) {
            const idToOption = new Map(state.options.map(o => [o.id, o]));
            updates.options.forEach(newO => {
              const existing = idToOption.get(newO.id);
              if (existing) {
                existing.label = newO.label;
              } else {
                state.options.push({
                  id: newO.id,
                  label: newO.label,
                  identifier: newOptIdentifier(),
                });
              }
            });
            state.options = updates.options.map(newO => idToOption.get(newO.id) || {
              id: newO.id,
              label: newO.label,
              identifier: newOptIdentifier(),
            });
            pruneTouched();
          }
          if (updates.scores) {
            for (const fid in updates.scores) {
              state.scoresUI[fid] ??= {};
              for (const oid in updates.scores[fid]) {
                const nextLikert = signedToLikert(updates.scores[fid][oid]);
                if (state.scoresUI[fid][oid] !== nextLikert) {
                  touchedCells.add(cellKey(fid, oid));
                }
                state.scoresUI[fid][oid] = nextLikert;
              }
            }
          }
          reconcileScores(state, state);
          renderCurrentStep();
          renderPreview();
        },
      });

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          ensureChartSize();
          if (config.previewMode === "live" || finished) {
            renderPreview(true);
          }
        });
        resizeObserver.observe(vizEl);
      }
    }

    if (config.previewMode === "after-finish") {
      previewCard.style.display = "none";
    }

    if (supportsWADD && showWADDCheckbox) {
      showWADDCheckbox.addEventListener("change", () => {
        showWADD = !!showWADDCheckbox.checked;
        updateWaddVisibility();
        renderPreview(true);
      });
    }

    let optSeq = 0, facSeq = 0, optIdentifierSeq = 0;
    const newOptId = () => `o${++optSeq}`;
    const newFacId = () => `f${++facSeq}`;
    // Assigns the next never-reused letter. Once given to an option, it's never handed
    // to another one, even after that option is removed - so a letter always identifies
    // the same option for the lifetime of the session.
    const newOptIdentifier = () => optionLetter(++optIdentifierSeq);

    const state: UIState = {
      decisionTopic: "",
      options: [
        { id: newOptId(), label: "", identifier: newOptIdentifier() },
        { id: newOptId(), label: "", identifier: newOptIdentifier() },
      ],
      factors: [
        { id: newFacId(), label: "", uiImportance: 3 },
        { id: newFacId(), label: "", uiImportance: 3 },
      ],
      scoresUI: {},
    };

    const touchedCells = new Set<string>();
    const touchedImportance = new Set<string>();
    const cellKey = (fid: string, oid: string) => `${fid}__${oid}`;
    const pruneTouched = () => {
      const valid = new Set<string>();
      state.factors.forEach(f => state.options.forEach(o => valid.add(cellKey(f.id, o.id))));
      for (const key of Array.from(touchedCells)) {
        if (!valid.has(key)) touchedCells.delete(key);
      }
      const validFactors = new Set(state.factors.map(f => f.id));
      for (const fid of Array.from(touchedImportance)) {
        if (!validFactors.has(fid)) touchedImportance.delete(fid);
      }
    };

    const deepClone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

    function reconcileScores(prev: UIState, next: UIState) {
      const newScores: Record<string, Record<string, number>> = {};
      const prevScores = prev.scoresUI || {};
      for (const f of next.factors) {
        newScores[f.id] = {};
        for (const o of next.options) {
          const kept = prevScores[f.id]?.[o.id];
          if (kept !== undefined) {
            newScores[f.id][o.id] = kept;
          }
        }
      }
      next.scoresUI = newScores;
      pruneTouched();
    }

    let currentStep = 1 as 1 | 2 | 3 | 4;

    function renderStep1() {
      stepHost.innerHTML = `
        <h2 class="h1" style="font-size:1.2rem">Step 1--Name the options</h2>
        <div style="height:24px"></div>
        <p style="color:var(--muted); margin:0 0 4px; font-size:1.5em; line-height:1.3">
          Enter one word or short phrase that describes what you are deciding about
          <span style="font-size:0.6em">(e.g., "apartments" or "what to do next summer")</span>.
        </p>
        <div style="margin-left:28px">
          <input id="decisionTopicInput" type="text" placeholder="Enter it here" style="width:33%" />
        </div>
        <div style="height:24px"></div>
        <div style="height:24px"></div>
        <p style="color:var(--muted); margin:0 0 10px; font-size:1.5em; line-height:1.3">Add/Name your choice options (max of ${MAX_CHOICES})</p>
        <div id="choices"></div>
        <div style="margin-top:8px">
          <button id="addChoiceBtn">Add Option</button>
        </div>
        <div style="height:32px"></div>
      `;

      const topicInput = stepHost.querySelector<HTMLInputElement>("#decisionTopicInput")!;
      topicInput.value = state.decisionTopic;
      topicInput.oninput = () => {
        state.decisionTopic = topicInput.value;
      };

      const container = stepHost.querySelector<HTMLDivElement>("#choices")!;
      drawChoices(container);

      stepHost.querySelector<HTMLButtonElement>("#addChoiceBtn")!.onclick = () => {
        if (state.options.length >= MAX_CHOICES) return;
        const prev = deepClone(state);
        state.options.push({ id: newOptId(), label: "", identifier: newOptIdentifier() });
        reconcileScores(prev, state);
        drawChoices(container);
        renderPreview();
      };

      backBtn.style.display = "none";
      nextBtn.textContent = "Next";
    }

    function drawChoices(container: HTMLElement) {
      container.innerHTML = "";
      state.options.forEach((opt, idx) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.margin = "6px 0";

        const prefix = document.createElement("span");
        prefix.textContent = `Option ${opt.identifier} →`;
        prefix.style.whiteSpace = "nowrap";
        prefix.style.color = "var(--muted)";
        prefix.style.fontWeight = "600";

        const input = document.createElement("input");
        input.type = "text";
        input.value = opt.label;
        input.placeholder = "Name this option";
        input.style.flex = "0 0 16.5%";
        input.oninput = () => {
          opt.label = input.value;
          renderPreview();
        };

        const remove = document.createElement("button");
        remove.textContent = "Remove";
        remove.onclick = () => {
          const prev = deepClone(state);
          state.options.splice(idx, 1);
          reconcileScores(prev, state);
          drawChoices(container);
          renderPreview();
        };

        row.append(prefix, input, remove);
        container.appendChild(row);
      });
    }

    function renderStep2() {
      stepHost.innerHTML = `
        <h2 class="h1" style="font-size:1.2rem">Step 2 — Add factors</h2>
        <p style="color:var(--muted); margin:10px 0 0; font-size:1.5em; line-height:1.3">
          Now specify the notable ways in which these options differ. These are the
          <i><b>factors</b></i> that could matter in your decision.
        </p>
        <div style="margin-left:60px">
          <p style="font-size:0.8em; color:var(--muted); margin:12px 0 0">For apartments, factors might be:</p>
          <ul style="font-size:0.8em; color:var(--muted); margin:0 0 12px; padding-left:24px">
            <li>Size</li>
            <li>Location</li>
            <li>Safety</li>
            <li>Lease flexibility</li>
            <li>Cost</li>
            <li>Style</li>
          </ul>
        </div>
        <p style="margin:0 0 14px">You can list up to ${MAX_FACTORS} factors, but a smaller number like 5-8 might be easier to deal with.</p>
        <div id="factors"></div>
        <div style="margin-top:8px">
          <button id="addFactorBtn">Add factor</button>
        </div>
        <div style="height:32px"></div>
      `;
      const container = stepHost.querySelector<HTMLDivElement>("#factors")!;
      drawFactorsList(container);

      stepHost.querySelector<HTMLButtonElement>("#addFactorBtn")!.onclick = () => {
        if (state.factors.length >= MAX_FACTORS) return;
        const prev = deepClone(state);
        state.factors.push({ id: newFacId(), label: "", uiImportance: 3 });
        reconcileScores(prev, state);
        drawFactorsList(container);
        renderPreview();
      };

      backBtn.style.display = "";
      nextBtn.textContent = "Next";
    }

    function drawFactorsList(container: HTMLElement) {
      container.innerHTML = "";
      state.factors.forEach((fac, idx) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.margin = "6px 0";

        const prefix = document.createElement("span");
        prefix.textContent = "Factor →";
        prefix.style.whiteSpace = "nowrap";
        prefix.style.color = "var(--muted)";
        prefix.style.fontWeight = "600";

        const input = document.createElement("input");
        input.type = "text";
        input.value = fac.label;
        input.placeholder = "Name this factor";
        input.style.flex = "0 0 16.5%";
        input.oninput = () => {
          fac.label = input.value;
          renderPreview();
        };

        const remove = document.createElement("button");
        remove.textContent = "Remove";
        remove.onclick = () => {
          const prev = deepClone(state);
          state.factors.splice(idx, 1);
          reconcileScores(prev, state);
          drawFactorsList(container);
          renderPreview();
        };

        row.append(prefix, input, remove);
        container.appendChild(row);
      });
    }

    const IMPORTANCE_LABELS = ["Low", "Mild", "Moderate", "High", "Very High"];
    const SCORE_LABELS = ["very bad", "bad", "okay", "good", "very good"];

    function renderStep2Importance() {
      stepHost.innerHTML = `
        <h2 class="h1" style="font-size:1.2rem">Step 3--Rate factor importance</h2>
        <div style="margin-top:4px; height:34px"></div>
        <div id="factorsImportance"></div>
      `;
      const container = stepHost.querySelector<HTMLDivElement>("#factorsImportance")!;
      drawFactorsImportance(container);

      backBtn.style.display = "";
      nextBtn.textContent = "Next";
    }

    function drawFactorsImportance(container: HTMLElement) {
      container.innerHTML = "";
      state.factors.forEach((fac, idx) => {
        const block = document.createElement("div");
        block.style.margin = "14px 0";
        block.style.paddingBottom = "10px";
        block.style.borderBottom = "1px solid #1e2a4a";

        const row = document.createElement("p");
        row.style.margin = "0 0 8px";
        row.style.color = "var(--muted)";
        const prefixText = document.createTextNode("You mentioned this factor: ");
        const nameSpan = document.createElement("span");
        nameSpan.style.color = "var(--fg)";
        nameSpan.style.fontWeight = "700";
        nameSpan.style.fontSize = "2.2em";
        nameSpan.textContent = fac.label;
        row.append(prefixText, nameSpan);

        const ratingLabel = document.createElement("p");
        ratingLabel.style.color = "var(--muted)";
        ratingLabel.style.margin = "2px 0 0 20px";
        ratingLabel.style.fontSize = "1.3em";
        ratingLabel.textContent = "Rate the importance of this factor for your decision.";

        const group = document.createElement("div");
        group.className = "importance-group";
        group.style.marginLeft = "20px";
        group.setAttribute("role", "radiogroup");
        const groupName = `importance_${fac.id}`;
        IMPORTANCE_LABELS.forEach((text, i) => {
          const level = i + 1;
          const optionLabel = document.createElement("label");
          optionLabel.className = "importance-option";
          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = groupName;
          radio.value = String(level);
          if (touchedImportance.has(fac.id) && fac.uiImportance === level) radio.checked = true;
          radio.onchange = () => {
            touchedImportance.add(fac.id);
            fac.uiImportance = level;
            renderPreview();
          };
          const textSpan = document.createElement("span");
          textSpan.textContent = text;
          optionLabel.append(radio, textSpan);
          group.appendChild(optionLabel);
        });

        const spacer = document.createElement("div");
        spacer.style.height = "1.4em";

        block.append(row, ratingLabel, group, spacer);
        container.appendChild(block);
      });
    }

    function isFactorFullyRated(f: { id: string }): boolean {
      return state.options.every(o => touchedCells.has(cellKey(f.id, o.id)));
    }

    function renderStep4() {
      if (config.step4Style === "sequential" || config.step4Style === "sequentialWithFactorIntro") {
        const isFactorIntro = config.step4Style === "sequentialWithFactorIntro";
        stepHost.innerHTML = `
          <h2 class="h1" style="font-size:1.2rem">Step 4</h2>
          ${isFactorIntro ? `<hr style="border:none; border-top:1px solid rgba(255,255,255,0.3); margin:12px 0 20px" />` : ""}
          <div id="factorBlocks"></div>
        `;
        const container = stepHost.querySelector<HTMLDivElement>("#factorBlocks")!;
        if (isFactorIntro) drawFactorIntroQuestions(container);
        else drawSequentialQuestions(container);
      } else {
        stepHost.innerHTML = `
          <h2 class="h1" style="font-size:1.2rem">Step 4--Rate options on each factor</h2>
          <p style="color:var(--muted); margin:10px 0 16px; font-size:1.5em; line-height:1.3">Now you'll rate options based on how good or bad they are on a given factor. Please use this scale.</p>
          <div style="display:flex; justify-content:center">
            <svg viewBox="0 0 700 210" width="100%" style="max-width:640px; overflow:visible">
              <g font-family="inherit">
                ${[
                  { n: 1, boxX: 282, labelX: 140 },
                  { n: 2, boxX: 316, labelX: 260 },
                  { n: 3, boxX: 350, labelX: 350 },
                  { n: 4, boxX: 384, labelX: 440 },
                  { n: 5, boxX: 418, labelX: 560 },
                ].map(({ n, boxX, labelX }) => `
                  <line x1="${boxX}" y1="45" x2="${labelX}" y2="140" stroke="rgba(232,238,252,0.35)" stroke-width="1.5" />
                  <rect x="${boxX - 15}" y="15" width="30" height="30" rx="6" ry="6"
                    fill="rgba(232,238,252,0.08)" stroke="rgba(232,238,252,0.25)" />
                  <text x="${boxX}" y="31" text-anchor="middle" dominant-baseline="middle"
                    fill="var(--fg)" font-weight="600" font-size="16">${n}</text>
                  <text x="${labelX}" y="158" text-anchor="middle"
                    fill="var(--muted)" font-style="italic" font-size="19">${SCORE_LABELS[n - 1]}</text>
                `).join("")}
              </g>
            </svg>
          </div>
          <hr style="border:none; border-top:1px solid #1e2a4a; margin:20px 0" />
          <div id="factorBlocks"></div>
        `;
        const container = stepHost.querySelector<HTMLDivElement>("#factorBlocks")!;
        drawFactorBlocks(container);
      }

      backBtn.style.display = "";
      nextBtn.textContent = "Finish";
    }

    // Alternate Step 4 rendering ("wizard with new questions"): one self-contained
    // question at a time - "Think about Option X (label) on this factor: label. How would
    // you rate this option on this factor?" - instead of grouping every option for a
    // factor together under one shared scale legend. The next question is appended below
    // once the current one is answered, in the same factor-then-option order as the
    // default Step 4, using the same touchedCells/scoresUI state so Finish's validation
    // and the live preview both work unchanged.
    function drawSequentialQuestions(container: HTMLElement) {
      container.innerHTML = "";
      for (let fIdx = 0; fIdx < state.factors.length; fIdx++) {
        const f = state.factors[fIdx];
        let doneWithFactor = true;
        for (let oIdx = 0; oIdx < state.options.length; oIdx++) {
          const o = state.options[oIdx];
          drawSequentialQuestion(container, f, o);
          if (!touchedCells.has(cellKey(f.id, o.id))) { doneWithFactor = false; break; }
        }
        if (!doneWithFactor) break;
        // Separate this factor's fully-answered set of questions from the next factor's,
        // but only when there's a next set to separate it from.
        if (fIdx < state.factors.length - 1) {
          const divider = document.createElement("hr");
          divider.style.border = "none";
          divider.style.borderTop = "1px solid rgba(255,255,255,0.3)";
          divider.style.margin = "0 0 32px";
          container.appendChild(divider);
        }
      }
    }

    // Shared by both sequential Step 4 styles (GP3/GP4): the row of 5 numbered boxes, each
    // with its "very bad"..."very good" label underneath. onAnswered re-draws the whole
    // question list so the next question is revealed once this one gets a value.
    function buildRatingScale(
      f: { id: string },
      o: { id: string },
      onAnswered: () => void
    ): HTMLDivElement {
      const scale = document.createElement("div");
      scale.className = "rating-scale";
      scale.setAttribute("role", "radiogroup");
      const groupName = `score_${cellKey(f.id, o.id)}`;
      const currentValue = state.scoresUI[f.id]?.[o.id];
      for (let n = 1; n <= 5; n++) {
        const optionLabel = document.createElement("label");
        optionLabel.className = "rating-scale-option";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = groupName;
        radio.value = String(n);
        if (currentValue === n) radio.checked = true;
        radio.onchange = () => {
          state.scoresUI[f.id] ||= {};
          state.scoresUI[f.id][o.id] = n;
          touchedCells.add(cellKey(f.id, o.id));
          renderPreview();
          onAnswered();
        };
        const box = document.createElement("span");
        box.className = "rating-scale-box";
        const numberSpan = document.createElement("span");
        numberSpan.className = "rating-scale-number";
        numberSpan.textContent = String(n);
        const scoreLabel = document.createElement("span");
        scoreLabel.className = "rating-scale-label";
        scoreLabel.textContent = SCORE_LABELS[n - 1];
        box.append(numberSpan, scoreLabel);
        optionLabel.append(radio, box);
        scale.appendChild(optionLabel);
      }
      return scale;
    }

    function drawSequentialQuestion(
      container: HTMLElement,
      f: { id: string; label: string },
      o: { id: string; label: string; identifier: string }
    ) {
      const block = document.createElement("div");
      block.style.margin = "0 0 32px";

      const promptLine = document.createElement("p");
      promptLine.style.fontSize = "1.3em";
      promptLine.style.color = "var(--fg)";
      promptLine.style.margin = "0 0 4px";
      promptLine.append(document.createTextNode(`Think about Option ${o.identifier}`));
      if (o.label.trim()) {
        const nameSpan = document.createElement("span");
        nameSpan.style.fontWeight = "600";
        nameSpan.textContent = o.label;
        promptLine.append(document.createTextNode(" ("), nameSpan, document.createTextNode(")"));
      }
      const factorSpan = document.createElement("span");
      factorSpan.style.fontWeight = "600";
      factorSpan.textContent = f.label;
      promptLine.append(document.createTextNode(" on this factor: "), factorSpan, document.createTextNode("."));

      const questionLine = document.createElement("p");
      questionLine.style.fontSize = "1.3em";
      questionLine.style.color = "var(--muted)";
      questionLine.style.margin = "0 0 14px 20px";
      questionLine.textContent = "How would you rate this option on this factor?";

      const scale = buildRatingScale(f, o, () => drawSequentialQuestions(container));

      block.append(promptLine, questionLine, scale);
      container.appendChild(block);
    }

    // GP4's Step 4: each factor gets a centered, blue two-line intro plus a right-justified
    // "About this factor (...):" headline (both shown once, before any of that factor's
    // questions) instead of every question naming the factor and re-explaining the scale
    // on its own.
    function drawFactorIntroBlock(container: HTMLElement, f: { label: string }) {
      const introLine = document.createElement("p");
      introLine.style.fontSize = "1.3em";
      introLine.style.color = "var(--muted)";
      introLine.style.margin = "0 0 4px";
      introLine.style.textAlign = "left";
      const factorSpan = document.createElement("span");
      factorSpan.style.color = "var(--fg)";
      factorSpan.style.fontWeight = "700";
      factorSpan.style.fontSize = "1.7em";
      factorSpan.textContent = f.label;
      introLine.append(document.createTextNode("Think about this factor: "), factorSpan);

      const introSub = document.createElement("p");
      introSub.style.fontSize = "1.3em";
      introSub.style.color = "var(--muted)";
      introSub.style.margin = "0 0 20px";
      introSub.style.textAlign = "left";
      introSub.textContent = "Your options might vary in how good they are on this factor. Some might even be bad on the factor.";

      const aboutLine = document.createElement("p");
      aboutLine.style.fontSize = "1.6em";
      aboutLine.style.fontWeight = "700";
      aboutLine.style.color = "var(--fg)";
      aboutLine.style.margin = "0 0 10px";
      aboutLine.style.textAlign = "left";
      aboutLine.textContent = `About this factor (${f.label}):`;

      container.append(introLine, introSub, aboutLine);
    }

    function drawFactorIntroQuestion(
      container: HTMLElement,
      f: { id: string; label: string },
      o: { id: string; label: string; identifier: string }
    ) {
      const block = document.createElement("div");
      block.style.margin = "0 0 32px";

      const promptLine = document.createElement("p");
      promptLine.style.fontSize = "1.3em";
      promptLine.style.color = "var(--fg)";
      promptLine.style.margin = "0 0 14px 60px";
      promptLine.style.textAlign = "left";
      promptLine.append(document.createTextNode(`rate Option ${o.identifier}`));
      if (o.label.trim()) {
        const nameSpan = document.createElement("span");
        nameSpan.style.fontWeight = "600";
        nameSpan.textContent = o.label;
        promptLine.append(document.createTextNode(" ("), nameSpan, document.createTextNode(")"));
      }

      const scale = buildRatingScale(f, o, () => drawFactorIntroQuestions(container));
      scale.style.marginLeft = "60px";

      block.append(promptLine, scale);
      container.appendChild(block);
    }

    function drawFactorIntroQuestions(container: HTMLElement) {
      container.innerHTML = "";
      for (let fIdx = 0; fIdx < state.factors.length; fIdx++) {
        const f = state.factors[fIdx];
        drawFactorIntroBlock(container, f);
        let doneWithFactor = true;
        for (let oIdx = 0; oIdx < state.options.length; oIdx++) {
          const o = state.options[oIdx];
          drawFactorIntroQuestion(container, f, o);
          if (!touchedCells.has(cellKey(f.id, o.id))) { doneWithFactor = false; break; }
        }
        if (!doneWithFactor) break;
        // Separate this factor's fully-answered set of questions from the next factor's,
        // but only when there's a next set to separate it from.
        if (fIdx < state.factors.length - 1) {
          const divider = document.createElement("hr");
          divider.style.border = "none";
          divider.style.borderTop = "1px solid rgba(255,255,255,0.3)";
          divider.style.margin = "0 0 32px";
          container.appendChild(divider);
        }
      }
    }

    function drawFactorBlocks(container: HTMLElement) {
      container.innerHTML = "";
      for (let fIdx = 0; fIdx < state.factors.length; fIdx++) {
        const f = state.factors[fIdx];
        const block = document.createElement("div");
        block.style.margin = "0 0 40px";

        const considerLine = document.createElement("p");
        considerLine.style.margin = "0";
        considerLine.style.color = "var(--muted)";
        considerLine.textContent = "Consider this factor:";

        const bigFactor = document.createElement("div");
        bigFactor.style.fontSize = "2.2em";
        bigFactor.style.fontWeight = "700";
        bigFactor.style.lineHeight = "1.2";
        bigFactor.style.margin = "2px 0 14px";
        bigFactor.textContent = f.label;

        block.append(considerLine, bigFactor);

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "36px";
        row.style.flexWrap = "wrap";

        for (let oIdx = 0; oIdx < state.options.length; oIdx++) {
          const o = state.options[oIdx];
          const cell = document.createElement("div");
          cell.style.width = "180px";
          cell.style.flex = "0 0 180px";

          const question = document.createElement("p");
          question.style.fontSize = "1.05em";
          question.style.color = "var(--muted)";
          question.style.margin = "0 0 8px";
          question.style.textAlign = "center";
          question.append(
            document.createTextNode("On this factor,"),
            document.createElement("br"),
            document.createTextNode("what’s your rating of"),
            document.createElement("br")
          );
          const optionLine = document.createTextNode(`Option ${o.identifier}`);
          question.append(optionLine);
          if (o.label.trim()) {
            const openParen = document.createTextNode(" (");
            const nameSpan = document.createElement("span");
            nameSpan.style.color = "var(--fg)";
            nameSpan.style.fontWeight = "600";
            nameSpan.textContent = o.label;
            const closeParen = document.createTextNode(")?");
            question.append(openParen, nameSpan, closeParen);
          } else {
            question.append(document.createTextNode("?"));
          }

          const group = document.createElement("div");
          group.className = "likert-group";
          group.style.justifyContent = "center";
          group.setAttribute("role", "radiogroup");
          const groupName = `score_${cellKey(f.id, o.id)}`;
          const currentValue = state.scoresUI[f.id]?.[o.id];
          for (let n = 1; n <= 5; n++) {
            const optionLabel = document.createElement("label");
            optionLabel.className = "likert-option";
            optionLabel.title = SCORE_LABELS[n - 1];
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = groupName;
            radio.value = String(n);
            if (currentValue === n) radio.checked = true;
            radio.onchange = () => {
              state.scoresUI[f.id] ||= {};
              state.scoresUI[f.id][o.id] = n;
              touchedCells.add(cellKey(f.id, o.id));
              renderPreview();
              drawFactorBlocks(container);
            };
            const numberSpan = document.createElement("span");
            numberSpan.textContent = String(n);
            optionLabel.append(radio, numberSpan);
            group.appendChild(optionLabel);
          }

          cell.append(question, group);
          row.appendChild(cell);

          // Don't reveal the next option's question/buttons until this one is answered.
          if (!touchedCells.has(cellKey(f.id, o.id))) break;
        }

        block.appendChild(row);
        container.appendChild(block);

        // Don't reveal the next factor's block until this one is fully rated.
        if (!isFactorFullyRated(f)) break;
      }
    }

    function renderCurrentStep() {
      if (currentStep === 1) renderStep1();
      else if (currentStep === 2) renderStep2();
      else if (currentStep === 3) renderStep2Importance();
      else renderStep4();
    }

    function go(step: 1 | 2 | 3 | 4) {
      currentStep = step;
      renderCurrentStep();
    }

    backBtn.onclick = () => {
      if (currentStep === 2) go(1);
      else if (currentStep === 3) go(2);
      else if (currentStep === 4) go(3);
      window.scrollTo(0, 0);
    };

    nextBtn.onclick = () => {
      if (currentStep === 1) {
        if (state.options.length < 2) { alert("Please add at least 2 choices."); return; }
        const prev = deepClone(state); reconcileScores(prev, state);
        go(2);
      } else if (currentStep === 2) {
        if (state.factors.length < 1) { alert("Please add at least 1 factor."); return; }
        const unnamedFactor = state.factors.find(f => !f.label.trim());
        if (unnamedFactor) { alert("Please name every factor before continuing."); return; }
        const prev = deepClone(state); reconcileScores(prev, state);
        go(3);
      } else if (currentStep === 3) {
        const untouchedFactor = state.factors.find(f => !touchedImportance.has(f.id));
        if (untouchedFactor) {
          alert(`Please set an importance rating for "${untouchedFactor.label}" before continuing.`);
          return;
        }
        const prev = deepClone(state); reconcileScores(prev, state);
        go(4);
      } else {
        const untouchedCell = state.factors
          .flatMap(f => state.options.map(o => ({ f, o })))
          .find(({ f, o }) => !touchedCells.has(cellKey(f.id, o.id)));
        if (untouchedCell) {
          alert(`Please rate "${untouchedCell.o.label}" on "${untouchedCell.f.label}" before finishing.`);
          return;
        }
        finished = true;
        reachedFinish = true;
        const revealLayout = () => {
          if (config.previewMode === "after-finish") {
            previewCard.style.display = "";
          }
          if (config.restrictPreviewUntilFinish) {
            chartNoteWrap.style.display = "";
            waddControlWrap.style.display = "";
            previewHeading.innerHTML = `<h2 class="h1" style="font-size:2.2rem">Your Layout</h2>`;
          } else if (isGp2) {
            previewHeading.innerHTML = `<h2 class="h1" style="font-size:2.6rem; margin-bottom:0">YOUR Layout</h2>`;
          }
          if (isGp2) {
            // The layout becomes its own "page" - the entry wizard steps out of the way
            // until someone asks for them back via backToEntriesBtn.
            wizardCard.style.display = "none";
            if (backToEntriesBtn) backToEntriesBtn.style.display = "";
          }
          updateWaddVisibility();
          decisionHost.style.display = "";
          if (decisionIntroNote) decisionIntroNote.style.display = "";
          renderPreview(true);
          window.scrollTo(0, 0);
        };
        // Every time someone reaches their own layout, walk them through a quick, fixed
        // example (Julie's apartment decision) explaining how to read it - row height =
        // importance, green vs. brown = how favorably an option was rated. Only
        // meaningful for the chart preview; the table view has no layout to explain.
        if (isGp2 && config.kind === "chart") {
          runLayoutTutorial(revealLayout);
          return;
        }
        revealLayout();
        return;
      }
      window.scrollTo(0, 0);
    };

    // GP2 with wadd=on skips the "Show scores" button entirely (scores are always
    // visible), so its label spells out what they are instead of assuming the button's
    // wording already explained it. Short enough to afford a slightly larger font than
    // the plain "WADD Scores" label used everywhere else.
    const waddScoresLabelIsLong = isGp2 && waddMode === "always";
    const WADD_SCORES_LABEL_TEXT = waddScoresLabelIsLong
      ? "WADD Scores (from optimized decision rule)"
      : "WADD Scores";
    const WADD_SCORES_LABEL_HTML = `<div style="font-size:${waddScoresLabelIsLong ? "1em" : "0.9em"}; color:var(--muted); font-weight:600">${WADD_SCORES_LABEL_TEXT}</div>`;

    function renderWaddScoresBlockFallback(data: ReturnType<typeof toChartData>) {
      const waddScores = computeWaddScores(data.options, data.factors, data.scores);
      const itemsHtml = data.options.map(o => `
        <div style="text-align:center">
          <div style="font-size:0.9em; color:var(--muted); font-weight:600">Option ${o.identifier}</div>
          <div style="font-size:1.4em; font-weight:700; color:var(--fg)">${Math.round(waddScores[o.id])}</div>
        </div>
      `).join("");
      waddScoresWrap.innerHTML = `
        <div style="display:flex; align-items:center; gap:24px">
          <div style="flex:0 0 180px">${WADD_SCORES_LABEL_HTML}</div>
          <div style="display:flex; gap:24px; flex-wrap:wrap; justify-content:space-around; flex:1">${itemsHtml}</div>
        </div>
      `;
    }

    function renderWaddScoresBlock(data: ReturnType<typeof toChartData>) {
      if (!supportsWADD) return;

      if (config.kind !== "chart") {
        renderWaddScoresBlockFallback(data);
        return;
      }

      // Align each score directly under its own chart column, measured from the live
      // DOM rather than assumed equal widths, so it's correct regardless of column-width
      // compression. The chart's own render() animates column positions over a 150ms D3
      // transition (see DecisionLayoutChart.render), so wait past that before measuring -
      // same reasoning as the tutorial highlight fix.
      window.setTimeout(() => {
        const waddScores = computeWaddScores(data.options, data.factors, data.scores);
        const headerRects = Array.from(vizEl.querySelectorAll<SVGGraphicsElement>(".dl-cols > g.col rect.header-bg"));
        if (headerRects.length !== data.options.length || headerRects.length === 0) {
          renderWaddScoresBlockFallback(data);
          return;
        }
        const vizRect = vizEl.getBoundingClientRect();
        const itemsHtml = data.options.map((o, i) => {
          const r = headerRects[i].getBoundingClientRect();
          const left = Math.round(r.left - vizRect.left);
          const width = Math.round(r.width);
          return `
            <div style="position:absolute; left:${left}px; width:${width}px; text-align:center">
              <div style="font-size:0.9em; color:var(--muted); font-weight:600">Option ${o.identifier}</div>
              <div style="font-size:1.4em; font-weight:700; color:var(--fg)">${Math.round(waddScores[o.id])}</div>
            </div>
          `;
        }).join("");
        // The label sits at the row's far left (x:0, matching vizEl's own left edge -
        // waddScoresWrap and vizEl share the same left offset within the card). Its width
        // is capped to the gutter before the first option column, so a long label (e.g.
        // "Scores for Optimized Decision Rule (WADD Scores)") wraps instead of running
        // into that column's score.
        const firstColLeft = Math.round(headerRects[0].getBoundingClientRect().left - vizRect.left);
        waddScoresWrap.innerHTML = `
          <div style="position:relative; min-height:3.2em">
            <div style="position:absolute; left:0; top:0; width:${Math.max(0, firstColLeft - 8)}px; display:flex; align-items:center; min-height:3.2em">${WADD_SCORES_LABEL_HTML}</div>
            ${itemsHtml}
          </div>
        `;
      }, 200);
    }

    function renderPreview(force = false) {
      if (config.previewMode === "after-finish" && !finished && !force) return;
      const neutralFallback = config.kind === "chart"
        ? config.previewMode === "live" || !finished
        : false;
      const data = toChartData(state, neutralFallback);
      if (config.kind === "chart") {
        ensureChartSize();
        chart?.setReadOnly(!!config.restrictPreviewUntilFinish && !reachedFinish);
        chart?.data({ ...data, modified: touchedCells }).render();
      } else {
        renderTable(data, false);
      }
      renderWaddScoresBlock(data);
    }

    function toChartData(s: UIState, neutralFallback = false) {
      const options = s.options.map(o => ({
        id: o.id,
        label: o.label,
        weight: 1,
        identifier: o.identifier,
      }));

      const factorWeights = computeNormalizedWeights(s.factors);
      const factors = s.factors.map(f => ({
        id: f.id,
        label: f.label,
        weight: factorWeights[f.id] ?? 0,
      }));

      const scores: Record<string, Record<string, number>> = {};
      for (const f of s.factors) {
        scores[f.id] = {};
        for (const o of s.options) {
          const ui = s.scoresUI[f.id]?.[o.id];
          scores[f.id][o.id] = ui ? mapLikertToSigned(ui) : (neutralFallback ? 0 : 0);
        }
      }

      return { options, factors, scores };
    }

    function renderTable(data: ReturnType<typeof toChartData>, includeWADD: boolean) {
      vizEl.replaceChildren();

      const table = document.createElement("table");
      table.className = "table";
      table.style.width = "100%";
      table.style.minWidth = "680px";

      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");

      const factorTh = document.createElement("th");
      factorTh.scope = "col";
      factorTh.textContent = "Factor";
      headRow.appendChild(factorTh);

      const importanceTh = document.createElement("th");
      importanceTh.scope = "col";
      importanceTh.textContent = "Importance";
      importanceTh.classList.add("table-importance");
      headRow.appendChild(importanceTh);

      data.options.forEach((o) => {
        const th = buildOptionHeaderCell("th", o.identifier, o.label) as HTMLTableCellElement;
        th.scope = "col";
        headRow.appendChild(th);
      });

      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      data.factors.forEach((factor) => {
        const row = document.createElement("tr");
        const labelCell = buildFactorHeaderCell("th", factor.label) as HTMLTableCellElement;
        labelCell.scope = "row";
        row.appendChild(labelCell);

        const importanceCell = document.createElement("td");
        importanceCell.classList.add("table-importance");
        const sourceFactor = state.factors.find(sf => sf.id === factor.id);
        importanceCell.textContent = sourceFactor ? IMPORTANCE_LABELS[sourceFactor.uiImportance - 1] : "—";
        row.appendChild(importanceCell);

        data.options.forEach((option) => {
          const td = document.createElement("td");
          td.style.textAlign = "center";
          const likert = state.scoresUI[factor.id]?.[option.id];
          td.textContent = typeof likert === "number" ? String(likert) : "—";
          row.appendChild(td);
        });

        tbody.appendChild(row);
      });

      if (includeWADD) {
        const waddScores = computeWaddScores(data.options, data.factors, data.scores);
        const waddRow = document.createElement("tr");
        waddRow.classList.add("table-wadd");
        const waddLabel = document.createElement("th");
        waddLabel.scope = "row";
        waddLabel.textContent = "WADD";
        waddRow.appendChild(waddLabel);
        const filler = document.createElement("td");
        filler.classList.add("table-importance");
        filler.textContent = "";
        waddRow.appendChild(filler);
        data.options.forEach(option => {
          const td = document.createElement("td");
          td.style.textAlign = "center";
          td.textContent = waddScores[option.id].toFixed(1);
          waddRow.appendChild(td);
        });
        tbody.appendChild(waddRow);
      }

      table.appendChild(tbody);
      vizEl.appendChild(table);
    }

    // GP2 only: a short pointer sitting right above the decision button, since the
    // entries are no longer directly below it once the layout became its own "page".
    const decisionIntroNote = isGp2 ? document.createElement("p") : null;
    if (decisionIntroNote) {
      decisionIntroNote.textContent = "Click below to make decision. You can also modify your entries (see above).";
      decisionIntroNote.style.margin = "16px 0 0";
      decisionIntroNote.style.color = "var(--muted)";
      if (config.restrictPreviewUntilFinish ? !reachedFinish : !finished) {
        decisionIntroNote.style.display = "none";
      }
      root.appendChild(decisionIntroNote);
    }

    const decisionHost = document.createElement("div");
    if (config.restrictPreviewUntilFinish ? !reachedFinish : !finished) {
      decisionHost.style.display = "none";
    }
    root.appendChild(decisionHost);

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
      getDecisionData: () => {
        const data = toChartData(state, false);
        const waddScores = computeWaddScores(data.options, data.factors, data.scores);
        return {
          layoutName: root.parentElement?.dataset.layout ?? null,
          decisionTopic: state.decisionTopic,
          options: data.options.map(o => ({
            id: o.id,
            label: state.options.find(so => so.id === o.id)?.label || o.label,
            weight: o.weight,
            identifier: o.identifier,
          })),
          factors: data.factors.map(f => ({
            id: f.id,
            label: state.factors.find(sf => sf.id === f.id)?.label || f.label,
            weight: f.weight,
          })),
          scores: data.scores,
          waddScores,
        };
      },
      showWaddOnButtons: waddMode === "always",
      onRestart: () => location.reload(),
      onReturnToLayout: () => {
        bottomNextWrap.style.display = "";
      },
      onNext: () => {
        renderPostDecisionLanding(root);
      },
    });

    go(1);
    if (config.previewMode === "live") {
      renderPreview(true);
    }
  };
}
