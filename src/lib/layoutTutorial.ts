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
  | { type: "cell"; index: number; boxy?: boolean }
  // The full column of score cells under a single option (all factor rows for that
  // option), drawn once per option side by side - unlike the other targets, this one
  // produces several highlight boxes (with a "?" beneath each) instead of just one.
  | { type: "optionColumns" };

// What the example chart should look like for a given step: whether the factor rows
// have been introduced yet (vs. just the option headers on their own), and which cells
// (by "fid__oid" key) already have their score color revealed - everything else renders
// as a blank/gray placeholder box, via DecisionLayoutChart's own "unmodified cell" look.
type ChartState = { factorsRevealed: boolean; revealedCells: string[] };

type Step =
  | { kind: "intro"; text: string; buttonLabel: string }
  | {
      kind: "chart";
      text: string;
      buttonLabel: string;
      showCartoon?: boolean;
      chartState: ChartState;
      target: HighlightTarget;
      captionPosition?: "above" | "below";
    }
  | { kind: "final"; text: string; buttonLabel: string };

// Julie's example decision, matching the reference screenshot: 3 apartment options
// (Elm/Oak/Main Street) and 3 factors (Air Conditioning, Location, Price). Location is
// High importance (tall row), Air Conditioning is Low importance (thin row).
// Likert 1-5 maps to an exact 0/25/50/75/100% green fill, so these values were chosen to
// land on the specific fills called out in the walkthrough (2 = mostly brown, 3 = half
// green/half brown, 4 = mostly green).
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
  price: { elm: 2, oak: 3, main: 4 },
};
const toSigned = (v: number) => (v - 3) / 2;

// Matches the height DecisionLayoutChart is given in renderChart() below. Fixed and known
// up front (EX_FACTORS never changes at runtime) so it can also be used to reserve the
// chart's final space before the chart itself is ever built - see chartHost's minHeight.
const EXAMPLE_CHART_HEIGHT = EX_FACTORS.length * (90 + 8) + 92 + 32;

// Cell index within DecisionLayoutChart's own row-major cell order (factorIndex * numOptions + optionIndex).
const CELL = {
  acElm: 0 * EX_OPTIONS.length + 0,
  acMain: 0 * EX_OPTIONS.length + 2,
  locationElm: 1 * EX_OPTIONS.length + 0,
};
const ROW = { ac: 0, location: 1 };

const CELL_KEY = (fid: string, oid: string) => `${fid}__${oid}`;
const ALL_CELL_KEYS = EX_FACTORS.flatMap(f => EX_OPTIONS.map(o => CELL_KEY(f.id, o.id)));

const NO_CELLS: ChartState = { factorsRevealed: false, revealedCells: [] };
const FACTORS_NO_CELLS: ChartState = { factorsRevealed: true, revealedCells: [] };
const AC_ELM: ChartState = { factorsRevealed: true, revealedCells: [CELL_KEY("ac", "elm")] };
const AC_ELM_MAIN: ChartState = { factorsRevealed: true, revealedCells: [CELL_KEY("ac", "elm"), CELL_KEY("ac", "main")] };
const AC_ELM_MAIN_LOC_ELM: ChartState = {
  factorsRevealed: true,
  revealedCells: [CELL_KEY("ac", "elm"), CELL_KEY("ac", "main"), CELL_KEY("location", "elm")],
};
const ALL_REVEALED: ChartState = { factorsRevealed: true, revealedCells: ALL_CELL_KEYS };

const STEPS: Step[] = [
  {
    kind: "intro",
    text: "Great! Soon, you'll see <strong>YOUR</strong> layout.<br><br>But first: an example!",
    buttonLabel: "Continue",
  },
  {
    kind: "chart",
    showCartoon: true,
    chartState: NO_CELLS,
    target: { type: "optionHeaders" },
    text: "Julie is choosing apartments. She entered Elm St, Oak St, and Main St as her options. Therefore, her layout starts like this:",
    buttonLabel: "Continue",
  },
  {
    kind: "chart",
    chartState: FACTORS_NO_CELLS,
    target: { type: "factorLabels" },
    text: "She entered three factors.",
    buttonLabel: "Next",
  },
  {
    kind: "chart",
    chartState: FACTORS_NO_CELLS,
    target: { type: "row", index: ROW.location },
    text: "The reason why the <strong><em>Location</em></strong> box is taller than the others is because Julie rated <strong><em>Location</em></strong> as <strong><em>High</em></strong> in importance.",
    buttonLabel: "Next",
  },
  {
    kind: "chart",
    chartState: FACTORS_NO_CELLS,
    target: { type: "row", index: ROW.ac },
    text: "The reason why the <strong><em>Air Conditioning</em></strong> box is shorter than the others is because Julie rated <strong><em>Air Conditioning</em></strong> as <strong><em>Low</em></strong> in importance.",
    buttonLabel: "Next",
  },
  {
    kind: "chart",
    chartState: AC_ELM,
    target: { type: "cell", index: CELL.acElm },
    text: "Next, Julie rated the air conditioning at the Elm St apartment as <strong><em>Good</em></strong>\u2014which was a 4 on the 5-point scale. Therefore, we'll color that box as mostly green.",
    buttonLabel: "Next",
  },
  {
    kind: "chart",
    chartState: AC_ELM_MAIN,
    target: { type: "cell", index: CELL.acMain },
    text: "However, because Julie rated the air conditioning for the <strong><em>Main St</em></strong> apartment as <strong><em>Bad</em></strong>, which is only 2 out of 5, we'll color that box as mostly brown.",
    buttonLabel: "Next",
  },
  {
    kind: "chart",
    chartState: AC_ELM_MAIN_LOC_ELM,
    target: { type: "cell", index: CELL.locationElm, boxy: true },
    text: "She rated the <strong><em>Location</em></strong> of the Elm St apartment as <strong><em>Okay</em></strong>, so we'll color that box as half green.",
    buttonLabel: "Next",
  },
  {
    kind: "chart",
    chartState: ALL_REVEALED,
    target: { type: "none" },
    text: "Here is how the full layout looks with all the boxes colored in.",
    buttonLabel: "Next",
  },
  {
    kind: "chart",
    chartState: ALL_REVEALED,
    target: { type: "optionColumns" },
    text: "To find Julie\u2019s <strong>BEST OVERALL</strong> option, you simply find the one with the most green under it. Here, we can see there is slightly more green under Option C.",
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
  // Reserved up front (before the chart itself is ever built) so chartHost already
  // occupies its final height while it's still invisible during the first chart step's
  // 650ms delay - see the "chart" branch in showStep for why that matters.
  chartHost.style.minHeight = `${EXAMPLE_CHART_HEIGHT}px`;
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

  function buildExampleChartData(state: ChartState) {
    const options = EX_OPTIONS.map(o => ({ id: o.id, label: o.label, weight: 1, identifier: o.identifier }));
    const factors = state.factorsRevealed
      ? EX_FACTORS.map(f => ({ id: f.id, label: f.label, weight: f.weight }))
      : [];
    const revealed = new Set(state.revealedCells);
    const scores: Record<string, Record<string, number>> = {};
    EX_FACTORS.forEach(f => {
      scores[f.id] = {};
      EX_OPTIONS.forEach(o => {
        scores[f.id][o.id] = toSigned(EX_LIKERT[f.id][o.id]);
      });
    });
    return { options, factors, scores, modified: Array.from(revealed) };
  }

  // Builds the chart the first time it's needed, then re-renders it in place on every
  // subsequent call with that step's ChartState - factor rows and individual cell colors
  // fade in/out via DecisionLayoutChart's own enter/exit transitions as `state` changes
  // from step to step, rather than each step getting a separate chart instance.
  function renderChart(state: ChartState): DecisionLayoutChart {
    if (!chart) {
      // chartArea must already be laid out (display != "none") before this measures its
      // width, or chartHost.clientWidth reads as 0 and the chart falls back to a width
      // that doesn't match its actual box - which is what was cutting the right edge off.
      const width = Math.max(360, chartHost.clientWidth || 640);
      chart = new DecisionLayoutChart(chartHost, {
        width,
        height: EXAMPLE_CHART_HEIGHT,
        showAddControls: false,
        showIdentifierPrefix: true,
        allowImportanceDrag: false,
        readOnly: true,
        margin: { top: 92 },
      });
    }
    chart.data(buildExampleChartData(state)).render();
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
  // repeat it at several points across the yellow box - spanning the box's own
  // top-to-bottom edges - to make the row's height unmistakable wherever someone happens
  // to be looking. Two of those sit inside the row label's own blue box (10% in from
  // each edge, clearing the label text in the middle), the rest evenly across the cells.
  const ROW_HEIGHT_ARROW_CELL_COUNT = 3;
  function drawHeightArrows(boxTop: number, boxHeight: number, labelLeft: number, labelRight: number, cellsRight: number) {
    const h = Math.max(8, boxHeight);
    const labelWidth = labelRight - labelLeft;
    drawSingleHeightArrow(labelLeft + labelWidth * 0.10 - 12, boxTop, h);
    drawSingleHeightArrow(labelLeft + labelWidth * 0.90 - 12, boxTop, h);

    const cellsLeft = labelRight;
    const cellsWidth = cellsRight - cellsLeft;
    for (let i = 0; i < ROW_HEIGHT_ARROW_CELL_COUNT; i++) {
      const frac = (i + 0.5) / ROW_HEIGHT_ARROW_CELL_COUNT;
      const x = cellsLeft + cellsWidth * frac - 12; // center the 24px-wide glyph on this point
      drawSingleHeightArrow(x, boxTop, h);
    }
  }

  // Draws one boxy yellow highlight (never the oval cell style) with a centered "?"
  // beneath it - used for each option's full column of score cells at once, so someone
  // can visually compare "how much green" sits under Option A vs. B vs. C.
  function drawOptionColumnMark(rect: DOMRect, hostRect: DOMRect, pad: number) {
    const boxLeft = Math.round(rect.left - hostRect.left - pad);
    const boxTop = Math.round(rect.top - hostRect.top - pad);
    const boxWidth = Math.round(rect.width + pad * 2);
    const boxHeight = Math.round(rect.height + pad * 2);

    const box = document.createElement("div");
    box.className = "tutorial-highlight";
    box.style.left = `${boxLeft}px`;
    box.style.top = `${boxTop}px`;
    box.style.width = `${boxWidth}px`;
    box.style.height = `${boxHeight}px`;
    annotationLayer.appendChild(box);

    const mark = document.createElement("div");
    mark.className = "tutorial-col-mark";
    mark.textContent = "?";
    mark.style.left = `${boxLeft}px`;
    mark.style.top = `${boxTop + boxHeight + 6}px`;
    mark.style.width = `${boxWidth}px`;
    annotationLayer.appendChild(mark);
  }

  function drawHighlight(target: HighlightTarget) {
    clearAnnotations();
    const hostRect = chartHost.getBoundingClientRect();
    const cols = Array.from(chartHost.querySelectorAll<SVGGElement>(".dl-cols > g.col"));
    const rows = Array.from(chartHost.querySelectorAll<SVGGElement>(".dl-rows > g.row"));
    const cells = Array.from(chartHost.querySelectorAll<SVGGElement>(".dl-grid > g.cell"));
    const numOptions = EX_OPTIONS.length;
    const numFactors = EX_FACTORS.length;
    const PAD = 8;

    if (target.type === "none") return;

    if (target.type === "optionColumns") {
      for (let cidx = 0; cidx < numOptions; cidx++) {
        const colCellRects: DOMRect[] = [];
        for (let ridx = 0; ridx < numFactors; ridx++) {
          const r = visibleRect(cells[ridx * numOptions + cidx], "rect.cell-bg");
          if (r) colCellRects.push(r);
        }
        if (colCellRects.length) drawOptionColumnMark(unionRect(colCellRects), hostRect, PAD);
      }
      return;
    }

    let rect: DOMRect | null = null;
    let isCell = false;
    let rowLabelBounds: { left: number; right: number } | null = null;

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
        rowLabelBounds = {
          left: Math.round(rowRect.left - hostRect.left),
          right: Math.round(rowRect.right - hostRect.left),
        };
      }
    } else if (target.type === "cell") {
      const cellRect = visibleRect(cells[target.index], "rect.cell-bg");
      if (cellRect) {
        rect = cellRect;
        isCell = !target.boxy;
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

    if (rowLabelBounds) {
      drawHeightArrows(boxTop, boxHeight, rowLabelBounds.left, rowLabelBounds.right, boxLeft + boxWidth);
    }
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
    const captionBelow = step.kind === "chart" && step.captionPosition === "below";
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
    eyebrow.style.display = step.kind === "chart" ? "" : "none";
    backBtn.style.display = pastIntro ? "" : "none";

    if (cartoonTimer !== null) {
      window.clearTimeout(cartoonTimer);
      cartoonTimer = null;
    }

    if (step.kind === "intro") {
      cartoonHost.style.display = "none";
      chartArea.style.display = "none";
      clearAnnotations();
    } else if (step.kind === "chart") {
      cartoonHost.style.display = step.showCartoon ? "" : "none";
      clearAnnotations();
      // chartArea stays laid out (display != "none") for this whole step, even before the
      // chart itself is built - chartHost's reserved minHeight means there's no visible
      // gap while it's invisible (opacity 0, the default before "--show" is added).
      // Toggling display here (as this used to) let the modal's height jump once the
      // chart appeared, and since .modal-overlay vertically centers the card, that jump
      // visibly re-centered it - Julie included - momentarily in the wrong spot.
      chartArea.style.display = "";

      const revealNow = () => {
        renderChart(step.chartState);
        chartArea.classList.add("tutorial-chart-area--show");
        afterChartSettled(() => {
          if (stepIndex !== index) return;
          drawHighlight(step.target);
        });
      };

      if (step.showCartoon && !chart) {
        // Only the very first chart step delays like this, so Julie's cartoon gets a
        // moment on its own before her (partial) layout fades in beneath her.
        chartArea.classList.remove("tutorial-chart-area--show");
        cartoonTimer = window.setTimeout(() => {
          if (stepIndex !== index) return;
          revealNow();
        }, 650);
      } else {
        revealNow();
      }
    } else {
      cartoonHost.style.display = "none";
      chartArea.style.display = "none";
      clearAnnotations();
    }
  }

  function onResize() {
    const step = STEPS[stepIndex];
    if (step.kind === "chart") drawHighlight(step.target);
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
