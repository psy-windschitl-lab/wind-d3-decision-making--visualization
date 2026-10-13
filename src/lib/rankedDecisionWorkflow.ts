// A wizard-only alternative to decisionWorkflow.ts's modal "Choose an option" flow. Instead
// of a dialog that covers the layout, this builds a full preference ranking (not just a
// single top choice) with questions and response buttons appended inline below the layout,
// each button aligned under its matching option's own column in the chart. Only as many
// ranks as are actually ambiguous are asked - with N options, the first N-1 ranks are asked
// explicitly and the last is implied automatically, since only one option is left by then.

type DecisionOption = { id: string; label: string; weight?: number; identifier?: string };
type DecisionFactor = { id: string; label: string; weight: number };
type DecisionScores = Record<string, Record<string, number>>;

type DecisionData = {
  options: DecisionOption[];
  factors: DecisionFactor[];
  scores: DecisionScores;
  waddScores: Record<string, number>;
  layoutName?: string | null;
  decisionTopic?: string;
};

type RankedAttachParams = {
  host: HTMLElement;
  // The element the result (chart or table) is rendered into. For a chart, its rendered
  // column header rects (".dl-cols > g.col rect.header-bg") are measured to align each
  // rank's response buttons under the matching option column, the same technique
  // renderWaddScoresBlock uses in layoutBuilderFactory.ts to align WADD scores under each
  // column. For a table (no chart to align under), its header row's option <th> cells
  // are measured the same way instead - see measureColumns below.
  vizEl: HTMLElement;
  getDecisionData: () => DecisionData;
  // Called when someone clicks the final "Yes, ready to move on." button.
  onNext?: () => void;
};

type RankedDecisionPayload = {
  recordedAt: string;
  decisionTopic?: string;
  layoutName?: string | null;
  ranking: Array<{
    rank: number;
    optionId: string;
    option: string;
    optionIdentifier?: string;
    waddScore: number;
  }>;
  dataset: {
    options: DecisionOption[];
    factors: DecisionFactor[];
    scores: DecisionScores;
    waddScores: Record<string, number>;
  };
};

const STORAGE_KEY = "decision-layout-ranking";
const ORDINALS = ["", "first", "second", "third", "fourth", "fifth"];

function questionHtmlFor(rank: number): string {
  if (rank === 1) return "Which option are you choosing?";
  const word = ORDINALS[rank] ?? `${rank}th`;
  return `Which option is your <u>${word} most preferred</u>?`;
}

function storeRanking(payload: RankedDecisionPayload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // no-op if storage not available
  }
}

function downloadRankingJson(payload: RankedDecisionPayload) {
  try {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = payload.recordedAt.replace(/[:.]/g, "-");
    a.href = url;
    a.download = `decision-ranking-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // no-op if a download can't be triggered (e.g. a restrictive sandbox)
  }
}

export function attachRankedDecisionWorkflow({ host, vizEl, getDecisionData, onNext }: RankedAttachParams) {
  if (!host) return;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "decision-btn";
  trigger.textContent = "Ready to Make My Decision";
  host.appendChild(trigger);

  const questionsWrap = document.createElement("div");
  questionsWrap.style.display = "none";
  questionsWrap.style.marginTop = "20px";
  host.appendChild(questionsWrap);

  let started = false;
  // In the order chosen, most preferred first. The implied last option (once only one is
  // left) is appended only at finalize time, not during the asking process.
  const rankedOptionIds: string[] = [];
  let resizeHandler: (() => void) | null = null;

  trigger.addEventListener("click", () => {
    if (started) return;
    started = true;
    trigger.style.display = "none";
    questionsWrap.style.display = "";
    renderQuestions();
    resizeHandler = () => renderQuestions();
    window.addEventListener("resize", resizeHandler);
  });

  // Each column's left/width, measured from the live DOM relative to questionsWrap's own
  // position (not assumed to share vizEl's offset) so alignment holds regardless of how
  // the chart's/table's card and the decision area are laid out relative to each other.
  function measureColumns(wrapRect: DOMRect, numOptions: number): Array<{ left: number; width: number }> | null {
    const headerRects = Array.from(vizEl.querySelectorAll<SVGGraphicsElement>(".dl-cols > g.col rect.header-bg"));
    if (headerRects.length) {
      return headerRects.map(r => {
        const rect = r.getBoundingClientRect();
        return { left: Math.round(rect.left - wrapRect.left), width: Math.round(rect.width) };
      });
    }
    // No chart - for the "table" layout, align under the table's own option columns
    // instead (its last numOptions header cells, same convention the result table and
    // the tutorial's highlight-drawing code both use).
    const table = vizEl.querySelector("table");
    if (table) {
      const optionThs = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th")).slice(-numOptions);
      if (!optionThs.length) return null;
      return optionThs.map(el => {
        const rect = el.getBoundingClientRect();
        return { left: Math.round(rect.left - wrapRect.left), width: Math.round(rect.width) };
      });
    }
    return null;
  }

  function buildOptionButton(
    opt: DecisionOption,
    state: "open" | "selected" | "unavailable"
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ranked-option-btn" + (state !== "open" ? ` ranked-option-btn--${state}` : "");
    btn.disabled = state !== "open";
    const idLine = document.createElement("div");
    idLine.className = "ranked-option-btn-id";
    idLine.textContent = `Option ${opt.identifier}`;
    const labelLine = document.createElement("div");
    labelLine.className = "ranked-option-btn-label";
    labelLine.textContent = opt.label;
    btn.append(idLine, labelLine);
    return btn;
  }

  function buildRankBlock(data: DecisionData, rank: number, isOpen: boolean): HTMLElement {
    const block = document.createElement("div");
    block.className = "ranked-question-block";

    const question = document.createElement("p");
    question.className = "ranked-question-text";
    question.innerHTML = questionHtmlFor(rank);
    block.appendChild(question);

    const buttonsWrap = document.createElement("div");
    buttonsWrap.className = "ranked-buttons-wrap";
    block.appendChild(buttonsWrap);

    // Positioned after buttonsWrap is actually in the DOM, so its own rect is real.
    requestAnimationFrame(() => {
      const wrapRect = buttonsWrap.getBoundingClientRect();
      const cols = measureColumns(wrapRect, data.options.length);
      const useAbsolute = !!cols && cols.length === data.options.length;
      if (useAbsolute) {
        buttonsWrap.style.position = "relative";
        buttonsWrap.style.minHeight = "72px";
      }
      // Nudge the question text over to roughly start above the first response button,
      // instead of sitting flush at the card's left edge while the buttons themselves are
      // indented to align under the chart's/table's first option column.
      question.style.marginLeft = useAbsolute && cols ? `${cols[0].left}px` : "";
      data.options.forEach((opt, i) => {
        const chosenAt = rankedOptionIds.indexOf(opt.id);
        let state: "open" | "selected" | "unavailable";
        if (!isOpen) {
          state = chosenAt === rank - 1 ? "selected" : "unavailable";
        } else {
          state = chosenAt === -1 ? "open" : "unavailable";
        }
        const btn = buildOptionButton(opt, state);
        if (useAbsolute && cols) {
          btn.style.position = "absolute";
          btn.style.left = `${cols[i].left}px`;
          btn.style.width = `${cols[i].width}px`;
        }
        if (state === "open") {
          btn.addEventListener("click", () => {
            rankedOptionIds.push(opt.id);
            renderQuestions();
          });
        }
        buttonsWrap.appendChild(btn);
      });
    });

    return block;
  }

  function renderQuestions() {
    const data = getDecisionData();
    const ranksNeeded = Math.max(0, data.options.length - 1);

    if (rankedOptionIds.length >= ranksNeeded) {
      finalize(data);
      return;
    }

    questionsWrap.innerHTML = "";
    const nextRank = rankedOptionIds.length + 1;
    for (let rank = 1; rank <= nextRank; rank++) {
      questionsWrap.appendChild(buildRankBlock(data, rank, rank === nextRank));
    }
  }

  function finalize(data: DecisionData) {
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
      resizeHandler = null;
    }
    const remaining = data.options.map(o => o.id).filter(id => !rankedOptionIds.includes(id));
    const fullRanking = [...rankedOptionIds, ...remaining];
    const waddScores = data.waddScores;

    const payload: RankedDecisionPayload = {
      recordedAt: new Date().toISOString(),
      decisionTopic: data.decisionTopic,
      layoutName: data.layoutName,
      ranking: fullRanking.map((id, idx) => {
        const opt = data.options.find(o => o.id === id)!;
        return {
          rank: idx + 1,
          optionId: opt.id,
          option: opt.label,
          optionIdentifier: opt.identifier,
          waddScore: Number((waddScores[id] ?? 0).toFixed(2)),
        };
      }),
      dataset: {
        options: data.options.map(opt => ({
          id: opt.id,
          label: opt.label,
          weight: opt.weight,
          identifier: opt.identifier,
        })),
        factors: (data.factors ?? []).map(factor => ({
          id: factor.id,
          label: factor.label,
          weight: factor.weight,
        })),
        scores: data.scores ?? {},
        waddScores,
      },
    };

    storeRanking(payload);
    downloadRankingJson(payload);

    questionsWrap.innerHTML = "";
    const doneBlock = document.createElement("div");
    doneBlock.className = "ranked-question-block";
    const doneText = document.createElement("p");
    doneText.className = "ranked-question-text";
    doneText.textContent = "Your choice/preferences have been recorded. Ready to move on?";
    doneBlock.appendChild(doneText);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "decision-btn";
    nextBtn.textContent = "Yes, ready to move on.";
    nextBtn.addEventListener("click", () => onNext?.());
    doneBlock.appendChild(nextBtn);

    questionsWrap.appendChild(doneBlock);
  }
}
