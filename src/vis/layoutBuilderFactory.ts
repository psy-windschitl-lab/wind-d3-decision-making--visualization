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
  options: { id: string; label: string }[];
  factors: { id: string; label: string; uiImportance: number }[];
  scoresUI: Record<string, Record<string, number>>;
};

const MAX_CHOICES = 5;
// A, B, C, ... for default choice-option labels (n is 1-based).
const optionLetter = (n: number) => String.fromCharCode(64 + n);

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
      <section id="previewCard" class="card" style="margin-top:12px">
        <h2 class="h1" style="font-size:1.2rem">Preview</h2>
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
                });
              }
            });
            state.options = updates.options.map(newO => idToOption.get(newO.id) || {
              id: newO.id,
              label: newO.label,
            });
            pruneTouched();
          }
          if (updates.scores) {
            for (const fid in updates.scores) {
              state.scoresUI[fid] ??= {};
              for (const oid in updates.scores[fid]) {
                state.scoresUI[fid][oid] = signedToLikert(updates.scores[fid][oid]);
                touchedCells.add(cellKey(fid, oid));
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

    let optSeq = 0, facSeq = 0;
    const newOptId = () => `o${++optSeq}`;
    const newFacId = () => `f${++facSeq}`;

    const state: UIState = {
      options: [
        { id: newOptId(), label: "Option A" },
        { id: newOptId(), label: "Option B" },
      ],
      factors: [
        { id: newFacId(), label: "Factor 1", uiImportance: 3 },
        { id: newFacId(), label: "Factor 2", uiImportance: 3 },
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
        const idx = state.options.length + 1;
        state.options.push({ id: newOptId(), label: `Option ${optionLetter(idx)}` });
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
        row.style.display = "grid";
        row.style.gridTemplateColumns = "80px 1fr 90px";
        row.style.gap = "8px";
        row.style.margin = "6px 0";

        const idCell = document.createElement("div");
        idCell.textContent = String(idx + 1);

        const input = document.createElement("input");
        input.type = "text";
        input.value = opt.label;
        input.placeholder = `Option ${optionLetter(idx + 1)}`;
        input.oninput = () => {
          opt.label = input.value.trim() || `Option ${optionLetter(idx + 1)}`;
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

        row.append(idCell, input, remove);
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
        const idx = state.factors.length + 1;
        state.factors.push({ id: newFacId(), label: `Factor ${idx}`, uiImportance: 3 });
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
        row.style.display = "grid";
        row.style.gridTemplateColumns = "80px 1fr 90px";
        row.style.gap = "8px";
        row.style.margin = "6px 0";

        const idCell = document.createElement("div");
        idCell.textContent = String(idx + 1);

        const input = document.createElement("input");
        input.type = "text";
        input.value = fac.label;
        input.placeholder = `Factor ${idx + 1}`;
        input.oninput = () => {
          fac.label = input.value.trim() || `Factor ${idx + 1}`;
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

        row.append(idCell, input, remove);
        container.appendChild(row);
      });
    }

    const IMPORTANCE_LABELS = ["Low", "Mild", "Moderate", "High", "Very High"];

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
        row.style.display = "grid";
        row.style.gridTemplateColumns = "1fr 90px";
        row.style.gap = "8px";

        const input = document.createElement("input");
        input.type = "text";
        input.value = fac.label;
        input.placeholder = `Factor ${idx + 1}`;
        input.oninput = () => {
          fac.label = input.value.trim() || `Factor ${idx + 1}`;
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

        row.append(input, remove);

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

    function renderStep4() {
      stepHost.innerHTML = `
        <h2 class="h1" style="font-size:1.2rem">Step 3 — Score each factor per option</h2>
        <div style="overflow:auto; max-width:100%">
          <table class="table" style="width:100%; min-width:680px">
            <thead>
              <tr>
                <th scope="col">Factor</th>
                ${state.options.map(o => `<th scope="col">${o.label}</th>`).join("")}
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      `;

      const tbody = stepHost.querySelector<HTMLTableSectionElement>("tbody")!;
      tbody.innerHTML = "";

      state.factors.forEach((f) => {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.scope = "row";
        th.textContent = f.label;
        tr.appendChild(th);

        state.options.forEach((o) => {
          const td = document.createElement("td");
          td.style.minWidth = "140px";
          const group = document.createElement("div");
          group.className = "likert-group";
          group.setAttribute("role", "radiogroup");
          const groupName = `score_${cellKey(f.id, o.id)}`;
          const currentValue = state.scoresUI[f.id]?.[o.id];
          for (let n = 1; n <= 5; n++) {
            const optionLabel = document.createElement("label");
            optionLabel.className = "likert-option";
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
            };
            const numberSpan = document.createElement("span");
            numberSpan.textContent = String(n);
            optionLabel.append(radio, numberSpan);
            group.appendChild(optionLabel);
          }
          td.appendChild(group);
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });

      backBtn.style.display = "";
      nextBtn.textContent = "Finish";
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
      const headCells = ["Factor", "Importance", ...data.options.map(o => o.label)];
      headCells.forEach((label, idx) => {
        const th = document.createElement("th");
        th.scope = idx === 0 ? "col" : "col";
        th.textContent = label;
        if (label === "Importance") th.classList.add("table-importance");
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      data.factors.forEach((factor) => {
        const row = document.createElement("tr");
        const labelCell = document.createElement("th");
        labelCell.scope = "row";
        labelCell.textContent = factor.label;
        row.appendChild(labelCell);

        const importanceCell = document.createElement("td");
        importanceCell.classList.add("table-importance");
        const sourceFactor = state.factors.find(sf => sf.id === factor.id);
        importanceCell.textContent = sourceFactor ? String(sourceFactor.uiImportance) : "—";
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
