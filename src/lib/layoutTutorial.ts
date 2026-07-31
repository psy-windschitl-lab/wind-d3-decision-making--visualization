import { DecisionLayoutChart } from "./vis";

// A short guided walkthrough, shown once someone finishes the wizard and right before
// their own layout appears, that explains how to read a layout using a fixed, fictional
// example ("Julie's" apartment decision). It reuses the real DecisionLayoutChart
// component (in read-only mode) so the example always looks exactly like the real thing,
// and measures the rendered SVG to draw its highlight callouts in the right place.

type HighlightTarget =
  | { type: "optionHeaders" }
  | { type: "factorLabels" }
  | { type: "row"; index: number }
  | { type: "cell"; index: number };

type Step =
  | { kind: "intro"; text: string; buttonLabel: string }
  | { kind: "cartoon"; text: string; buttonLabel: string }
  | { kind: "highlight"; target: HighlightTarget; text: string; buttonLabel: string }
  | { kind: "final"; text: string; buttonLabel: string };

// Julie's example decision: 3 apartment options, 3 factors. Location is Very High
// importance (tall row), Air Conditioning is Low importance (thin row), Kitchen is
// Moderate. Ratings below match the specific cells called out in the walkthrough.
const EX_FACTORS = [
  { id: "location", label: "Location", weight: 5 },
  { id: "ac", label: "Air Conditioning", weight: 1 },
  { id: "kitchen", label: "Kitchen", weight: 3 },
];
const EX_OPTIONS = [
  { id: "elm", label: "Elm Street Apartment", identifier: "A" },
  { id: "main", label: "Main Street Apartment", identifier: "B" },
  { id: "oak", label: "Oak Street Apartment", identifier: "C" },
];
// Likert 1-5 ("very bad" .. "very good"), matching DecisionLayoutChart's own scale.
const EX_LIKERT: Record<string, Record<string, number>> = {
  location: { elm: 4, main: 2, oak: 3 },
  ac: { elm: 4, main: 1, oak: 3 },
  kitchen: { elm: 2, main: 4, oak: 3 },
};
const toSigned = (v: number) => (v - 3) / 2;

// Cell index within DecisionLayoutChart's own row-major cell order (factorIndex * numOptions + optionIndex).
const CELL = {
  acElm: 1 * EX_OPTIONS.length + 0,
  acMain: 1 * EX_OPTIONS.length + 1,
  locationOak: 0 * EX_OPTIONS.length + 2,
};

const STEPS: Step[] = [
  {
    kind: "intro",
    text: "Great! Soon, you'll see the layout for your decision.",
    buttonLabel: "Continue",
  },
  {
    kind: "cartoon",
    text: "It will look similar to this one, which was for Julie's decision about apartments.",
    buttonLabel: "Continue",
  },
  {
    kind: "highlight",
    target: { type: "optionHeaders" },
    text: "Julie entered three options.",
    buttonLabel: "Next",
  },
  {
    kind: "highlight",
    target: { type: "factorLabels" },
    text: "\u2026and three factors.",
    buttonLabel: "Next",
  },
  {
    kind: "highlight",
    target: { type: "row", index: 0 },
    text: "This row for the location factor was made extra thick, or tall, because Julie rated location as very important.",
    buttonLabel: "Next",
  },
  {
    kind: "highlight",
    target: { type: "row", index: 1 },
    text: "This row is thin because Julie said air conditioning was low in importance.",
    buttonLabel: "Next",
  },
  {
    kind: "highlight",
    target: { type: "cell", index: CELL.acElm },
    text: "This box reflects that Julie rated the air conditioning of the Elm Street Apartment a 4 (good).",
    buttonLabel: "Next",
  },
  {
    kind: "highlight",
    target: { type: "cell", index: CELL.acMain },
    text: "She rated the air conditioning of Main Street a 1 (very bad).",
    buttonLabel: "Next",
  },
  {
    kind: "highlight",
    target: { type: "cell", index: CELL.locationOak },
    text: "She rated the location of Oak Street a 3 (okay).",
    buttonLabel: "Next",
  },
  {
    kind: "final",
    text: "Now let's look at the layout for your own decision!",
    buttonLabel: "See my layout",
  },
];

const CARTOON_SVG = `
  <svg viewBox="0 0 220 200" width="180" height="164" aria-hidden="true" focusable="false">
    <circle cx="150" cy="150" r="5" fill="#1a2546"></circle>
    <circle cx="161" cy="133" r="8" fill="#1a2546"></circle>
    <ellipse cx="169" cy="60" rx="46" ry="34" fill="#1a2546"></ellipse>
    <ellipse cx="169" cy="60" rx="39" ry="27" fill="#e8eefc"></ellipse>
    <text x="169" y="70" text-anchor="middle" font-size="30" font-weight="700" fill="#2f64b7">?</text>
    <rect x="55" y="150" width="70" height="45" rx="18" fill="#2f64b7"></rect>
    <circle cx="90" cy="120" r="38" fill="#e8b58c"></circle>
    <path d="M55 110 Q60 70 90 72 Q120 70 125 110 Q120 92 90 92 Q60 92 55 110 Z" fill="#5b3a29"></path>
    <circle cx="78" cy="122" r="3.5" fill="#22293f"></circle>
    <circle cx="102" cy="122" r="3.5" fill="#22293f"></circle>
    <path d="M80 138 Q90 132 100 138" stroke="#22293f" stroke-width="2.5" fill="none" stroke-linecap="round"></path>
  </svg>
`;

const SEEN_STORAGE_KEY = "decision-layout-tutorial-seen";

// Whether this browser has already auto-played the layout tutorial once. Wrapped in a
// try/catch since localStorage can throw (e.g. private browsing in some browsers) -
// worst case, the tutorial just plays every time instead of failing outright.
export function hasSeenLayoutTutorial(): boolean {
  try {
    return localStorage.getItem(SEEN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markLayoutTutorialSeen(): void {
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, "1");
  } catch {
    // ignore - non-fatal if it can't be persisted
  }
}

export function runLayoutTutorial(onComplete: () => void): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay tutorial-overlay";

  const card = document.createElement("div");
  card.className = "modal tutorial-card";
  overlay.appendChild(card);

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "tutorial-skip";
  skipBtn.textContent = "Skip";
  card.appendChild(skipBtn);

  const eyebrow = document.createElement("p");
  eyebrow.className = "tutorial-eyebrow";
  eyebrow.textContent = "How to read your layout";
  card.appendChild(eyebrow);

  const captionBox = document.createElement("div");
  captionBox.className = "tutorial-caption";
  card.appendChild(captionBox);

  const cartoonHost = document.createElement("div");
  cartoonHost.className = "tutorial-cartoon";
  cartoonHost.innerHTML = `${CARTOON_SVG}<div class="tutorial-cartoon-name">Julie</div>`;
  cartoonHost.style.display = "none";
  card.appendChild(cartoonHost);

  const chartArea = document.createElement("div");
  chartArea.className = "tutorial-chart-area";
  chartArea.style.display = "none";
  const chartHost = document.createElement("div");
  chartHost.className = "tutorial-chart-host";
  const annotationLayer = document.createElement("div");
  annotationLayer.className = "tutorial-annotation-layer";
  chartArea.append(chartHost, annotationLayer);
  card.appendChild(chartArea);

  const footer = document.createElement("div");
  footer.className = "tutorial-footer";
  const dots = document.createElement("div");
  dots.className = "tutorial-dots";
  STEPS.forEach(() => {
    const dot = document.createElement("span");
    dot.className = "tutorial-dot";
    dots.appendChild(dot);
  });
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "decision-btn tutorial-next";
  footer.append(dots, nextBtn);
  card.appendChild(footer);

  document.body.appendChild(overlay);

  let chart: DecisionLayoutChart | null = null;
  let stepIndex = 0;
  let cartoonTimer: number | null = null;

  function buildExampleChartData() {
    const options = EX_OPTIONS.map(o => ({ id: o.id, label: o.label, weight: 1, identifier: o.identifier }));
    const factors = EX_FACTORS.map(f => ({ id: f.id, label: f.label, weight: f.weight }));
    const scores: Record<string, Record<string, number>> = {};
    const modified: string[] = [];
    EX_FACTORS.forEach(f => {
      scores[f.id] = {};
      EX_OPTIONS.forEach(o => {
        scores[f.id][o.id] = toSigned(EX_LIKERT[f.id][o.id]);
        modified.push(`${f.id}__${o.id}`);
      });
    });
    return { options, factors, scores, modified };
  }

  function ensureChart(): DecisionLayoutChart {
    if (chart) return chart;
    const width = Math.max(360, chartHost.clientWidth || card.clientWidth || 640);
    const height = EX_FACTORS.length * (90 + 8) + 92 + 32;
    chart = new DecisionLayoutChart(chartHost, {
      width,
      height,
      showAddControls: false,
      showIdentifierPrefix: true,
      allowImportanceDrag: false,
      readOnly: true,
      margin: { top: 92 },
    });
    chart.data(buildExampleChartData()).render();
    return chart;
  }

  function clearAnnotations() {
    annotationLayer.replaceChildren();
  }

  function unionRect(rects: DOMRect[]): DOMRect {
    const left = Math.min(...rects.map(r => r.left));
    const top = Math.min(...rects.map(r => r.top));
    const right = Math.max(...rects.map(r => r.right));
    const bottom = Math.max(...rects.map(r => r.bottom));
    return new DOMRect(left, top, right - left, bottom - top);
  }

  function drawHighlight(target: HighlightTarget) {
    clearAnnotations();
    const hostRect = chartHost.getBoundingClientRect();
    const cols = Array.from(chartHost.querySelectorAll<SVGGElement>(".dl-cols > g.col"));
    const rows = Array.from(chartHost.querySelectorAll<SVGGElement>(".dl-rows > g.row"));
    const cells = Array.from(chartHost.querySelectorAll<SVGGElement>(".dl-grid > g.cell"));
    const numOptions = EX_OPTIONS.length;

    let rect: DOMRect | null = null;
    let oval = false;
    const PAD = 8;

    if (target.type === "optionHeaders" && cols.length) {
      rect = unionRect(cols.map(el => el.getBoundingClientRect()));
    } else if (target.type === "factorLabels" && rows.length) {
      rect = unionRect(rows.map(el => el.getBoundingClientRect()));
    } else if (target.type === "row") {
      const rowEl = rows[target.index];
      const lastCell = cells[target.index * numOptions + numOptions - 1];
      if (rowEl && lastCell) {
        rect = unionRect([rowEl.getBoundingClientRect(), lastCell.getBoundingClientRect()]);
      }
    } else if (target.type === "cell") {
      const cellEl = cells[target.index];
      if (cellEl) {
        rect = cellEl.getBoundingClientRect();
        oval = true;
      }
    }

    if (!rect || (rect.width === 0 && rect.height === 0)) return;

    const box = document.createElement("div");
    box.className = "tutorial-highlight" + (oval ? " tutorial-highlight--oval" : "");
    box.style.left = `${rect.left - hostRect.left - PAD}px`;
    box.style.top = `${rect.top - hostRect.top - PAD}px`;
    box.style.width = `${rect.width + PAD * 2}px`;
    box.style.height = `${rect.height + PAD * 2}px`;
    annotationLayer.appendChild(box);
  }

  function updateDots() {
    Array.from(dots.children).forEach((el, i) => {
      el.classList.toggle("tutorial-dot--active", i === stepIndex);
    });
  }

  function showStep(index: number) {
    stepIndex = index;
    const step = STEPS[index];
    updateDots();

    captionBox.textContent = step.text;
    captionBox.classList.toggle("tutorial-caption--big", step.kind === "intro" || step.kind === "final");
    nextBtn.textContent = step.buttonLabel;

    if (cartoonTimer !== null) {
      window.clearTimeout(cartoonTimer);
      cartoonTimer = null;
    }

    if (step.kind === "intro") {
      cartoonHost.style.display = "none";
      chartArea.style.display = "none";
    } else if (step.kind === "cartoon") {
      cartoonHost.style.display = "";
      chartArea.classList.remove("tutorial-chart-area--show");
      chartArea.style.display = "none";
      cartoonTimer = window.setTimeout(() => {
        if (stepIndex !== index) return;
        ensureChart();
        chartArea.style.display = "";
        requestAnimationFrame(() => chartArea.classList.add("tutorial-chart-area--show"));
      }, 650);
    } else if (step.kind === "highlight") {
      cartoonHost.style.display = "none";
      chartArea.style.display = "";
      chartArea.classList.add("tutorial-chart-area--show");
      ensureChart();
      requestAnimationFrame(() => drawHighlight(step.target));
    } else {
      cartoonHost.style.display = "none";
      chartArea.style.display = "none";
      clearAnnotations();
    }
  }

  function onResize() {
    const step = STEPS[stepIndex];
    if (step.kind === "highlight") drawHighlight(step.target);
  }
  window.addEventListener("resize", onResize);

  function finish() {
    if (cartoonTimer !== null) window.clearTimeout(cartoonTimer);
    window.removeEventListener("resize", onResize);
    overlay.remove();
    onComplete();
  }

  nextBtn.onclick = () => {
    if (stepIndex >= STEPS.length - 1) finish();
    else showStep(stepIndex + 1);
  };
  skipBtn.onclick = finish;

  showStep(0);
}
