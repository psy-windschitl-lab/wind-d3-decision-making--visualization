import { DecisionLayoutChart } from "./vis";

// A short guided walkthrough, shown once someone finishes the wizard and right before
// their own layout appears, that explains how to read a layout using a fixed, fictional
// example ("Julie's" apartment decision). It reuses the real DecisionLayoutChart
// component (in read-only mode) so the example always looks exactly like the real thing,
// and measures the rendered SVG to draw its highlight callouts in the right place.

type HighlightTarget =
  | { type: "none" }
  | { type: "optionHeaders" }
  | { type: "factorLabels" }
  | { type: "row"; index: number }
  | { type: "cell"; index: number };

type Step =
  | { kind: "intro"; text: string; buttonLabel: string }
  | { kind: "cartoon"; text: string; buttonLabel: string }
  | { kind: "highlight"; target: HighlightTarget; text: string; buttonLabel: string; captionPosition?: "above" | "below" }
  | { kind: "final"; text: string; buttonLabel: string };

// Julie's example decision, matching the reference screenshot: 3 apartment options
// (Elm/Oak/Main Street) and 3 factors (Air Conditioning, Location, Price). Location is
// High importance (tall row), Air Conditioning is Low importance (thin row).
// Likert 1-5 maps to an exact 0/25/50/75/100% green fill, so these values were chosen to
// land on the specific fills called out in the walkthrough (2 = mostly brown, 4 = mostly
// green).
const EX_FACTORS = [
  { id: "ac", label: "Air Conditioning", weight: 1 },
  { id: "location", label: "Location", weight: 4 },
  { id: "price", label: "Price", weight: 3 },
];
const EX_OPTIONS = [
  { id: "elm", label: "Elm Street", identifier: "A" },
  { id: "oak", label: "Oak Street", identifier: "B" },
  { id: "main", label: "Main Street", identifier: "C" },
];
const EX_LIKERT: Record<string, Record<string, number>> = {
  ac: { elm: 4, oak: 4, main: 2 },
  location: { elm: 3, oak: 2, main: 3 },
  price: { elm: 2, oak: 4, main: 4 },
};
const toSigned = (v: number) => (v - 3) / 2;

// Cell index within DecisionLayoutChart's own row-major cell order (factorIndex * numOptions + optionIndex).
const CELL = {
  acElm: 0 * EX_OPTIONS.length + 0,
  acMain: 0 * EX_OPTIONS.length + 2,
};
const ROW = { ac: 0, location: 1 };

const STEPS: Step[] = [
  {
    kind: "intro",
    text: "Great! Soon, you'll see <strong>YOUR</strong> layout.<br><br>But first: an example!",
    buttonLabel: "Continue",
  },
  {
    kind: "cartoon",
    text: "Julie is choosing apartments. Here is <strong>HER</strong> layout based on <strong>HER</strong> entries.",
    buttonLabel: "Continue",
  },
  {
    kind: "highlight",
    target: { type: "optionHeaders" },
    text: "She had entered three options.",
    buttonLabel: "Next",
  },
  {
    kind: "highlight",
    target: { type: "factorLabels" },
    text: "She entered three factors.",
    buttonLabel: "Next",
  },
  {
    kind: "highlight",
    target: { type: "row", index: ROW.location },
    text: "This row is thick/tall because she said location was \u201cHigh\u201d in importance.",
    buttonLabel: "Next",
  },
  {
    kind: "highlight",
    target: { type: "row", index: ROW.ac },
    text: "This row is thin because she said air conditioning was \u201cLow\u201d in importance.",
    buttonLabel: "Next",
  },
  {
    kind: "highlight",
    target: { type: "cell", index: CELL.acElm },
    text: "This is mostly green because she rated the air conditioning for Option A (Elm St) as \u201cGood.\u201d",
    buttonLabel: "Next",
  },
  {
    kind: "highlight",
    target: { type: "cell", index: CELL.acMain },
    text: "This is mostly brown because she rated the air conditioning for Option C (Main St) as \u201cBad.\u201d",
    buttonLabel: "Next",
  },
  {
    kind: "highlight",
    target: { type: "none" },
    text: "To find Julie\u2019s <strong>BEST OVERALL</strong> option, you simply find the one with the most green under it.<br><br>This will always be consistent with an optimized decision rule (involving scores that give more weight to evaluations on subjectively important factors).",
    buttonLabel: "Next",
    captionPosition: "below",
  },
  {
    kind: "final",
    text: "Ready to see <strong>YOUR</strong> layout?",
    buttonLabel: "See my layout",
  },
];

// A simple, original cartoon avatar - neutral/thoughtful expression (flat mouth, not a
// frown), with a small thought-bubble to suggest she's picturing the layout below.
const CARTOON_SVG = `
  <svg viewBox="0 0 220 200" width="180" height="164" aria-hidden="true" focusable="false">
    <circle cx="150" cy="150" r="5" fill="#1a2546"></circle>
    <circle cx="161" cy="133" r="8" fill="#1a2546"></circle>
    <ellipse cx="169" cy="60" rx="46" ry="34" fill="#1a2546"></ellipse>
    <ellipse cx="169" cy="60" rx="39" ry="27" fill="#e8eefc"></ellipse>
    <text x="169" y="70" text-anchor="middle" font-size="30" font-weight="700" fill="#2f64b7">?</text>
    <rect x="55" y="150" width="70" height="45" rx="18" fill="#2f64b7"></rect>
    <circle cx="90" cy="120" r="38" fill="#e8b58c"></circle>
    <path d="M52 122 Q50 145 60 152 Q54 130 58 108 Q60 70 90 72 Q120 70 122 108 Q126 130 120 152 Q130 145 128 122 Q128 92 90 92 Q52 92 52 122 Z" fill="#5b3a29"></path>
    <circle cx="78" cy="122" r="3.5" fill="#22293f"></circle>
    <circle cx="102" cy="122" r="3.5" fill="#22293f"></circle>
    <line x1="80" y1="136" x2="100" y2="136" stroke="#22293f" stroke-width="2.5" stroke-linecap="round"></line>
  </svg>
`;

export function runLayoutTutorial(onComplete: () => void): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay tutorial-overlay";

  const card = document.createElement("div");
  card.className = "modal tutorial-card";
  overlay.appendChild(card);

  // Hidden until the person clicks past the very first "Great!..." screen.
  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "tutorial-skip";
  skipBtn.textContent = "Skip";
  card.appendChild(skipBtn);

  const eyebrow = document.createElement("p");
  eyebrow.className = "tutorial-eyebrow";
  eyebrow.textContent = "Example";
  card.appendChild(eyebrow);

  const captionBox = document.createElement("div");
  captionBox.className = "tutorial-caption";
  // captionBox is a flex container (to vertically center its content); its innerHTML
  // must be a single wrapped block rather than raw mixed text/<strong>/<br> nodes, or
  // flex treats each text run and inline element as its own flex item and scrambles the
  // line breaks and wrapping instead of flowing as normal text.
  const captionText = document.createElement("div");
  captionBox.appendChild(captionText);
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
  // annotationLayer must be a child of chartHost, not a sibling under chartArea - an
  // absolutely-positioned box's "inset: 0" resolves against its containing block's
  // *padding* edge, while chartHost (a normal-flow sibling) starts at chartArea's
  // *content* edge, one padding-width further in. As siblings, every highlight drawn
  // relative to chartHost landed exactly chartArea's padding short of the correct
  // position (up and to the left). Nesting it inside chartHost (which has no padding of
  // its own) makes the two origins coincide.
  chartHost.appendChild(annotationLayer);
  chartArea.appendChild(chartHost);
  card.appendChild(chartArea);

  const footer = document.createElement("div");
  footer.className = "tutorial-footer";
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "tutorial-back";
  backBtn.textContent = "Back";
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
  footer.append(backBtn, dots, nextBtn);
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
    // chartArea must already be laid out (display != "none") before this measures its
    // width, or chartHost.clientWidth reads as 0 and the chart falls back to a width
    // that doesn't match its actual box - which is what was cutting the right edge off.
    const width = Math.max(360, chartHost.clientWidth || 640);
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

  // DecisionLayoutChart.render() animates attributes like transform/x/y/width/height
  // over a 150ms D3 transition, including on the very first render. A single
  // requestAnimationFrame fires on the next paint (~16ms later) - well before that
  // transition finishes - so measuring right away catches elements mid-flight and draws
  // the highlight around wherever they started, not where they end up. Wait past the
  // transition, then one more frame so layout has settled, before measuring.
  const CHART_SETTLE_MS = 200;
  function afterChartSettled(cb: () => void) {
    window.setTimeout(() => requestAnimationFrame(cb), CHART_SETTLE_MS);
  }

  function unionRect(rects: DOMRect[]): DOMRect {
    const left = Math.min(...rects.map(r => r.left));
    const top = Math.min(...rects.map(r => r.top));
    const right = Math.max(...rects.map(r => r.right));
    const bottom = Math.max(...rects.map(r => r.bottom));
    return new DOMRect(left, top, right - left, bottom - top);
  }

  // The .col/.row/.cell <g> elements are the whole interactive group, not just the
  // visible card - a row's resize-handle straddles its bottom edge, a cell's
  // score-handle can poke past its left/right edge at extreme scores, etc. Those
  // invisible hit-areas inflate the group's getBoundingClientRect() well past the card
  // people actually see, so measure the visible background rect inside the group
  // instead of the group itself.
  function visibleRect(el: SVGGElement | null | undefined, selector: string): DOMRect | null {
    if (!el) return null;
    const bg = el.querySelector<SVGGraphicsElement>(selector);
    return (bg ?? el).getBoundingClientRect();
  }

  // A vertical, double-headed "dimension" arrow (chevron tips + end caps) spanning the
  // exact top-to-bottom border of the yellow box, to make "thick/tall" concrete. x/y/h
  // are host-local coordinates; x is the left edge of the arrow's 24px-wide glyph.
  function drawSingleHeightArrow(x: number, y: number, h: number) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "tutorial-height-arrow");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", String(h));
    svg.style.left = `${x}px`;
    svg.style.top = `${y}px`;
    const mkLine = (x1: number, y1: number, x2: number, y2: number) => {
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", String(x1));
      line.setAttribute("y1", String(y1));
      line.setAttribute("x2", String(x2));
      line.setAttribute("y2", String(y2));
      line.setAttribute("stroke", "#ffd400");
      line.setAttribute("stroke-width", "3");
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);
    };
    mkLine(12, 4, 12, h - 4); // shaft
    mkLine(4, 4, 20, 4); // top end cap
    mkLine(4, h - 4, 20, h - 4); // bottom end cap
    mkLine(12, 4, 6, 12); // top arrowhead, left tick
    mkLine(12, 4, 18, 12); // top arrowhead, right tick
    mkLine(12, h - 4, 6, h - 12); // bottom arrowhead, left tick
    mkLine(12, h - 4, 18, h - 12); // bottom arrowhead, right tick
    annotationLayer.appendChild(svg);
  }

  // A single arrow off to the side is easy to miss against a whole highlighted row, so
  // repeat it at evenly-spaced points across the full width of the yellow box - spanning
  // the box's own top-to-bottom edges - to make the row's height unmistakable wherever
  // someone happens to be looking.
  const ROW_HEIGHT_ARROW_COUNT = 4;
  function drawHeightArrows(boxLeft: number, boxTop: number, boxWidth: number, boxHeight: number, rowLabelRight: number) {
    const h = Math.max(8, boxHeight);
    for (let i = 0; i < ROW_HEIGHT_ARROW_COUNT; i++) {
      const frac = (i + 0.5) / ROW_HEIGHT_ARROW_COUNT;
      let x = boxLeft + boxWidth * frac - 12; // center the 24px-wide glyph on this point
      if (i === 0) {
        // The leftmost slot's default position can land on top of the row label's own
        // text ("Factor: Air Conditioning" / "Factor: Location") since the label column
        // is wide - nudge it to just clear the label box instead.
        x = Math.max(x, rowLabelRight + 4);
      }
      drawSingleHeightArrow(x, boxTop, h);
    }
  }

  function drawHighlight(target: HighlightTarget) {
    clearAnnotations();
    const hostRect = chartHost.getBoundingClientRect();
    const cols = Array.from(chartHost.querySelectorAll<SVGGElement>(".dl-cols > g.col"));
    const rows = Array.from(chartHost.querySelectorAll<SVGGElement>(".dl-rows > g.row"));
    const cells = Array.from(chartHost.querySelectorAll<SVGGElement>(".dl-grid > g.cell"));
    const numOptions = EX_OPTIONS.length;

    if (target.type === "none") return;

    let rect: DOMRect | null = null;
    let isCell = false;
    let rowLabelRight: number | null = null;
    const PAD = 8;

    if (target.type === "optionHeaders" && cols.length) {
      const rects = cols.map(el => visibleRect(el, "rect.header-bg")).filter((r): r is DOMRect => !!r);
      if (rects.length) rect = unionRect(rects);
    } else if (target.type === "factorLabels" && rows.length) {
      const rects = rows.map(el => visibleRect(el, "rect.row-bg")).filter((r): r is DOMRect => !!r);
      if (rects.length) rect = unionRect(rects);
    } else if (target.type === "row") {
      const rowRect = visibleRect(rows[target.index], "rect.row-bg");
      const lastCellRect = visibleRect(cells[target.index * numOptions + numOptions - 1], "rect.cell-bg");
      if (rowRect && lastCellRect) {
        rect = unionRect([rowRect, lastCellRect]);
        rowLabelRight = Math.round(rowRect.right - hostRect.left);
      }
    } else if (target.type === "cell") {
      const cellRect = visibleRect(cells[target.index], "rect.cell-bg");
      if (cellRect) {
        rect = cellRect;
        isCell = true;
      }
    }

    if (!rect || (rect.width === 0 && rect.height === 0)) return;

    // Round to whole pixels so the highlight's edges land on the same pixel grid as the
    // SVG card beneath it instead of drifting a sub-pixel off from anti-aliasing/rounding
    // differences between SVG and HTML box rendering.
    const boxLeft = Math.round(rect.left - hostRect.left - PAD);
    const boxTop = Math.round(rect.top - hostRect.top - PAD);
    const boxWidth = Math.round(rect.width + PAD * 2);
    const boxHeight = Math.round(rect.height + PAD * 2);

    const box = document.createElement("div");
    box.className = "tutorial-highlight" + (isCell ? " tutorial-highlight--oval" : "");
    box.style.left = `${boxLeft}px`;
    box.style.top = `${boxTop}px`;
    box.style.width = `${boxWidth}px`;
    box.style.height = `${boxHeight}px`;
    annotationLayer.appendChild(box);

    if (rowLabelRight !== null) drawHeightArrows(boxLeft, boxTop, boxWidth, boxHeight, rowLabelRight);
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

    // innerHTML (not textContent) because STEPS text uses <br> for line breaks and
    // <strong> for emphasis - this is all fixed copy we author, never user input.
    captionText.innerHTML = step.text;
    captionBox.classList.toggle("tutorial-caption--big", step.kind === "intro" || step.kind === "final");
    nextBtn.textContent = step.buttonLabel;

    // Most steps show the caption above the chart (its natural position, right before
    // cartoonHost/chartArea in the DOM). A step can opt into "below" to have it read as
    // a comment on the chart people just finished looking at, instead of an instruction
    // for what they're about to see.
    const captionBelow = step.kind === "highlight" && step.captionPosition === "below";
    captionBox.classList.toggle("tutorial-caption--below", captionBelow);
    if (captionBelow) {
      chartArea.after(captionBox);
    } else {
      cartoonHost.before(captionBox);
    }

    // The "Skip" button only makes sense once someone's past the very first screen -
    // showing it immediately felt premature. The "Example" label only makes sense while
    // Julie's fictional example is actually on screen, not on the intro or the final
    // "ready to see yours" screen.
    const pastIntro = index > 0;
    skipBtn.style.display = pastIntro ? "" : "none";
    eyebrow.style.display = (step.kind === "cartoon" || step.kind === "highlight") ? "" : "none";
    backBtn.style.display = pastIntro ? "" : "none";

    if (cartoonTimer !== null) {
      window.clearTimeout(cartoonTimer);
      cartoonTimer = null;
    }

    if (step.kind === "intro") {
      cartoonHost.style.display = "none";
      chartArea.style.display = "none";
      clearAnnotations();
    } else if (step.kind === "cartoon") {
      cartoonHost.style.display = "";
      clearAnnotations();
      if (chart) {
        // Already built (e.g. navigating back to this step) - show immediately.
        chartArea.style.display = "";
        chartArea.classList.add("tutorial-chart-area--show");
      } else {
        chartArea.classList.remove("tutorial-chart-area--show");
        chartArea.style.display = "none";
        cartoonTimer = window.setTimeout(() => {
          if (stepIndex !== index) return;
          chartArea.style.display = "";
          ensureChart();
          requestAnimationFrame(() => chartArea.classList.add("tutorial-chart-area--show"));
        }, 650);
      }
    } else if (step.kind === "highlight") {
      cartoonHost.style.display = "none";
      chartArea.style.display = "";
      chartArea.classList.add("tutorial-chart-area--show");
      ensureChart();
      afterChartSettled(() => {
        if (stepIndex !== index) return;
        drawHighlight(step.target);
      });
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
  backBtn.onclick = () => {
    if (stepIndex > 0) showStep(stepIndex - 1);
  };
  skipBtn.onclick = finish;

  showStep(0);
}
