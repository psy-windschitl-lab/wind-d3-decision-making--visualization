import type { Page } from "../router";
import { DecisionLayoutChart } from "../lib/vis";
import { computeWaddScores } from "../lib/wadd";
import { attachDecisionWorkflow } from "../lib/decisionWorkflow";

type PreviewKind = "chart" | "table";

type BuilderConfig = {
  previewMode: "live" | "after-finish";
  kind: PreviewKind;
};

type UIState = {
  options: { id: string; label: string; identifier: string }[];
  factors: { id: string; label: string; uiImportance: number }[];
  scoresUI: Record<string, Record<string, number>>;
};

const MAX_CHOICES = 5;
// A, B, C, ... for choice-option identifiers (n is 1-based).
const optionLetter = (n: number) => String.fromCharCode(64 + n);
const FACTOR_IDENTIFIER = "Factor";

// Builds a two-line header cell: the fixed identifier (small) above the person's
// own description (regular size) - used for option/choice columns.
function buildOptionHeaderCell(tag: "th" | "td", identifier: string, description: string): HTMLElement {
  const cell = document.createElement(tag);
  const idLine = document.createElement("div");
  idLine.style.fontSize = "0.75em";
  idLine.style.color = "var(--muted)";
  idLine.style.fontWeight = "600";
  idLine.textContent = `Option ${identifier}`;
  const descLine = document.createElement("div");
  descLine.textContent = description;
  cell.append(idLine, descLine);
  return cell;
}

// Builds an inline header cell: the fixed "Factor:" identifier (tiny) followed by the
// person's own description (regular size) on the same line - used for factor rows.
function buildFactorHeaderCell(tag: "th" | "td", description: string): HTMLElement {
  const cell = document.createElement(tag);
  const idSpan = document.createElement("span");
  idSpan.style.fontSize = "0.7em";
  idSpan.style.color = "var(--muted)";
  idSpan.style.fontWeight = "600";
  idSpan.textContent = `${FACTOR_IDENTIFIER}: `;
  const descSpan = document.createElement("span");
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
    const supportsWADD = config.kind === "chart" || config.kind === "table";
    const waddSetting = ctx.query.get("wadd")?.toLowerCase();
    const waddMode = waddSetting === "on"
      ? "always"
      : waddSetting === "off"
        ? "never"
        : "checkbox";
    const showWADDControl = supportsWADD && waddMode === "checkbox"
      ? `
        <div style="margin-bottom:12px">
          <label style="display:flex; align-items:center; gap:8px; color:var(--fg)">
            <input type="checkbox" id="showWADD"> Show WADD Scores
          </label>
        </div>
      `
      : "";

    root.innerHTML = `
      <section class="card">
        <div id="step"></div>
        <div style="display:flex; gap:.5rem; margin-top:12px">
          <button id="backBtn" style="display:none">Back</button>
          <button id="nextBtn">Next</button>
        </div>
      </section>
      <section id="previewCard" class="card" style="margin-top:56px">
        <h2 class="h1" style="font-size:1.2rem">Summary of Your Information and Ratings</h2>
        ${showWADDControl}
        <div id="viz" style="margin-top:8px; background:#0f1730; border-radius:12px; padding:8px;"></div>
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

    let showWADD = waddMode === "always";
    let finished = config.previewMode === "after-finish" ? false : true;

    const BASE_HEIGHT = 600;
    const measureWidth = () => Math.max(360, vizEl.clientWidth || root.clientWidth || 960);

    let chart: DecisionLayoutChart | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const ensureChartSize = () => {
      if (!chart) return;
      chart.setSize(measureWidth(), BASE_HEIGHT);
    };

    if (config.kind === "chart") {
      chart = new DecisionLayoutChart(vizEl, {
        width: measureWidth(),
        height: BASE_HEIGHT,
        showWADD,
        showAddControls: false,
        showIdentifierPrefix: true,
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
        if (chart) chart.setShowWADD(showWADD);
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
        <h2 class="h1" style="font-size:1.2rem">Step 1 — Add choice options (max ${MAX_CHOICES})</h2>
        <div id="choices"></div>
        <div style="margin-top:8px">
          <button id="addChoiceBtn">Add More Choice Options</button>
        </div>
        <p style="color:var(--muted); margin-top:8px">You can rename choices anytime.</p>
      `;

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
        input.placeholder = "Describe this option";
        input.style.flex = "1";
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
        <h2 class="h1" style="font-size:1.2rem">Step 2 — Add factors (Part 1 of 2)</h2>
        <div id="factors"></div>
        <div style="margin-top:8px">
          <button id="addFactorBtn">Add factor</button>
        </div>
      `;
      const container = stepHost.querySelector<HTMLDivElement>("#factors")!;
      drawFactorsList(container);

      stepHost.querySelector<HTMLButtonElement>("#addFactorBtn")!.onclick = () => {
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
        input.placeholder = "Describe this factor";
        input.style.flex = "1";
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
        <h2 class="h1" style="font-size:1.2rem">Step 2 — Rate Importance (Part 2 of 2)</h2>
        <p style="color:var(--muted); margin-top:4px; font-size:1.8em; line-height:1.3">
          Now please rate the importance of each factor. For each factor, think about
          how your options differ and then rate how important these differences are to you.
        </p>
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

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";

        const prefix = document.createElement("span");
        prefix.textContent = "Factor →";
        prefix.style.whiteSpace = "nowrap";
        prefix.style.color = "var(--muted)";
        prefix.style.fontWeight = "600";

        const input = document.createElement("input");
        input.type = "text";
        input.value = fac.label;
        input.placeholder = "Describe this factor";
        input.style.flex = "1";
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
          drawFactorsImportance(container);
          renderPreview();
        };

        row.append(prefix, input, remove);

        const ratingLabel = document.createElement("p");
        ratingLabel.style.color = "var(--muted)";
        ratingLabel.style.margin = "2px 0 0 20px";
        ratingLabel.textContent = "Rate the importance of this factor for your decision";

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
      stepHost.innerHTML = `
        <h2 class="h1" style="font-size:1.2rem">Step 3 – Rate the options on each factor</h2>
        <p style="margin:10px 0 16px">Now, you'll rate each option on each factor, using this scale.</p>
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
              <text x="350" y="195" text-anchor="middle"
                fill="var(--muted)" font-style="italic" font-size="19">compared to the other options</text>
            </g>
          </svg>
        </div>
        <hr style="border:none; border-top:1px solid #1e2a4a; margin:20px 0" />
        <div id="factorBlocks"></div>
      `;
      const container = stepHost.querySelector<HTMLDivElement>("#factorBlocks")!;
      drawFactorBlocks(container);

      backBtn.style.display = "";
      nextBtn.textContent = "Finish";
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

        const instr1 = document.createElement("p");
        instr1.style.margin = fIdx === 0 ? "0 0 6px" : "0 0 14px";
        instr1.innerHTML = `Rate each option (relative to the other options) <u>on this factor</u>.`;

        block.append(considerLine, bigFactor, instr1);

        if (fIdx === 0) {
          const instr2 = document.createElement("p");
          instr2.style.margin = "0 0 14px";
          instr2.style.color = "var(--muted)";
          instr2.innerHTML = `For example, give a 1 if you thought an option was "very bad" compared to other options <u>on this factor</u>. Give it a 5 if you thought it was "very good."`;
          block.appendChild(instr2);
        }

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "48px";
        row.style.flexWrap = "wrap";

        state.options.forEach((o) => {
          const cell = document.createElement("div");
          cell.style.textAlign = "center";
          cell.style.width = "150px";
          cell.style.flex = "0 0 150px";

          const idLine = document.createElement("div");
          idLine.style.fontSize = "0.75em";
          idLine.style.color = "var(--muted)";
          idLine.style.fontWeight = "600";
          idLine.textContent = `Option ${o.identifier}`;

          const descLine = document.createElement("div");
          descLine.style.marginBottom = "6px";
          descLine.textContent = o.label;

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

          cell.append(idLine, descLine, group);
          row.appendChild(cell);
        });

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
    };

    nextBtn.onclick = () => {
      if (currentStep === 1) {
        if (state.options.length < 2) { alert("Please add at least 2 choices."); return; }
        const prev = deepClone(state); reconcileScores(prev, state);
        go(2);
      } else if (currentStep === 2) {
        if (state.factors.length < 1) { alert("Please add at least 1 factor."); return; }
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
        if (config.previewMode === "after-finish") {
          previewCard.style.display = "";
        }
        decisionHost.style.display = "";
        renderPreview(true);
      }
    };

    function renderPreview(force = false) {
      if (config.previewMode === "after-finish" && !finished && !force) return;
      const neutralFallback = config.kind === "chart"
        ? config.previewMode === "live" || !finished
        : false;
      const data = toChartData(state, neutralFallback);
      if (config.kind === "chart") {
        ensureChartSize();
        chart?.setShowWADD(showWADD);
        chart?.data({ ...data, modified: touchedCells }).render();
      } else {
        renderTable(data, showWADD);
      }
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

    const decisionHost = document.createElement("div");
    if (!finished) decisionHost.style.display = "none";
    root.appendChild(decisionHost);
    attachDecisionWorkflow({
      host: decisionHost,
      getDecisionData: () => {
        const data = toChartData(state, false);
        const waddScores = computeWaddScores(data.options, data.factors, data.scores);
        return {
          layoutName: root.parentElement?.dataset.layout ?? null,
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
    });

    go(1);
    if (config.previewMode === "live") {
      renderPreview(true);
    }
  };
}
