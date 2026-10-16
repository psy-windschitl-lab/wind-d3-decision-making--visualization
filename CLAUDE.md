# DLayout App — Notes for Claude Code

## What this is
A TypeScript/D3 decision-making visualization tool ("Decision Layout App"). No framework —
vanilla TS + D3, bundled with Vite. Deployed via AWS Amplify, which auto-deploys on push.

## Who you're working with
The repo owner is not a programmer. They can't run anything locally, review raw diffs
comfortably, or debug a failed build themselves. Practical implications:

- **Always run `npm install` and `npm run build` yourself and fix any errors before
  finishing.** A red Amplify build is the single most disruptive failure mode for them —
  don't rely on `tsc` type errors as a signal either way; the build script is plain
  `vite build` (esbuild, no type-checking gate), so something can be "type-unsafe" and
  still build fine, or vice versa if you introduce an actual syntax error.
- **Write PR descriptions and summaries in plain English.** Explain what changed and why
  in terms of what they'll *see*, not implementation details, e.g. "the yellow box around
  the location row now lines up with its edges" rather than "fixed getBoundingClientRect
  offset calculation."
- If a task is inherently visual (animations, highlights, layout, colors), **verify it
  visually** (dev server + screenshots) rather than just confirming it compiles — they
  can't easily do that verification themselves before merging.
- Known deploy gotchas worth re-checking if something seems to "not have worked": browser/
  CDN caching (test in a private window), and confirming Amplify actually says "Succeeded,"
  not just that a deploy finished.

## Architecture, briefly
- `src/main.ts` — registers routes (`/`, `/builder`, `/about`).
- `src/pages/LayoutBuilder.ts` — reads the `layout` URL query param, dynamically imports
  the matching module from `src/vis/*.ts` (lowercased filename or its `meta.name`), and
  renders it. **Any new file added under `src/vis/` with a default-exported `Page` is
  auto-registered as a layout option** — no manual wiring needed beyond that file.
- `src/vis/layoutBuilderFactory.ts` — the shared factory behind most layouts (`wizard`,
  `vanilla`, `gp1`, `gp2`, `gp3`, `gp4`, `table`). Individual files like `src/vis/gp2.ts`
  just call `createBuilderLayout({...config})` with different options (`previewMode`,
  `kind`, `restrictPreviewUntilFinish`, `step4Style`). Prefer adding config branches / a
  layout-name check here over duplicating this file — it's ~1000 lines, and duplicating it
  was explicitly called out as a past failure mode (partial copies, drift between copies).
  `gp3` is GP2 plus `step4Style: "sequential"` (Step 4 asks one rating question at a time
  instead of grouping a factor's options together). `gp4` is GP2 plus
  `step4Style: "sequentialWithFactorIntro"` (like gp3, but each factor first gets its own
  two-line intro before its one-at-a-time questions). `wizard` is GP4 plus
  `decisionFlow: "rankedInline"` (see below) - kept as its own file only so further
  wizard-specific tweaks can be made without touching `gp4.ts`. `table` is the same as
  `wizard` in every respect except `kind: "table"` (a table instead of a chart), the
  tutorial's opening line (promises a table instead of a layout, via `tutorialOptions` in
  `layoutBuilderFactory.ts`), and the "YOUR ___" reveal heading reading "YOUR Table"
  instead of "YOUR Layout" (same isGp2 branch, just keyed off `config.kind === "table"`).
  `decisionFlow` controls the final "pick your option" step: omit for the default (a modal
  dialog that covers the layout/table while picking - still used by gp2/gp3/gp4/gp1/etc.),
  or `"rankedInline"` (wizard/table) to build a full preference ranking inline below the
  layout/table instead, with response buttons aligned under each option's own column -
  the chart's column header rects for chart-kind layouts, or the result `<table>`'s own
  last N header `<th>`s for `table` (see `src/lib/rankedDecisionWorkflow.ts`'s
  `measureColumns`).
- `src/lib/vis.ts` — the real `DecisionLayoutChart` D3 component (rows = factors, height
  proportional to importance weight; columns = options; cells fill green/brown based on
  score). `src/DecisionLayoutChart.ts` is an older/simpler version — don't confuse the two;
  the factory and tutorial both import from `src/lib/vis.ts`.
- `src/lib/layoutTutorial.ts` — the "how to read your result" walkthrough using a fixed
  fictional example (Julie's apartment decision). For chart-kind layouts it mounts the
  real `DecisionLayoutChart` component in read-only mode; for `table` it builds a real
  `<table>` (same `.table`/`.table-importance` CSS classes as the real result table, no
  WADD row/mentions anywhere in this tutorial) from the same fixed example data - two
  separate step-content arrays (`STEPS_CHART`/`STEPS_TABLE`) share one set of plumbing
  (modal, highlight-box drawing, Back/Next/Skip) that branches on `kind`. Either way, it
  measures the rendered DOM to position its yellow highlight callouts; for the table, a
  `colWidths` array (measured once up front by `measureExampleTableLayout()` against the
  fully-revealed table) is fed into every subsequent table build via a `<colgroup>`, so
  every column - especially the option columns - sits at its final position from the very
  first step instead of shifting once factor rows/values appear. **Currently
  GP2/GP3/GP4/wizard/table-only** — gated in `layoutBuilderFactory.ts` via the `isGp2`
  variable (`root.parentElement?.dataset.layout` being `"gp2"`, `"gp3"`, `"gp4"`,
  `"wizard"`, or `"table"`). Don't let it leak into other layouts (GP1, vanilla, etc.)
  unless explicitly asked to expand its scope. `runLayoutTutorial`'s second argument,
  `{ introText?, kind? }`, overrides the opening line and/or picks `"table"` instead of
  the default `"chart"` (both set by `layoutBuilderFactory.ts`'s `tutorialOptions` for
  `config.kind === "table"`).
- `src/pages/chooser.ts` — the "Choose a Version" picker; layout options are described
  here for end users.
- Query params driving behavior: `layout` (wizard/vanilla/gp1/gp2/gp3/gp4/manual/table),
  `wadd` (always/off/toggleable), `intro` (which intro page).

## Qualtrics data capture (wizard/table only)
Intended to run inside a Qualtrics survey (embedded in an iframe), with the full response
captured into Qualtrics' own data export - not just left in the respondent's browser.
Scoped entirely to `decisionFlow === "rankedInline"` (wizard/table), since those are the
only versions meant to run in Qualtrics; GP1-4/vanilla's modal flow (`decisionWorkflow.ts`)
is untouched by any of this.
- `layoutBuilderFactory.ts` captures two timestamps: `appStartedAt` (page mount) and
  `layoutShownAt` (set inside `revealLayout`, i.e. once their own - not the tutorial's -
  result is actually shown). Only the `rankedInline` branch's `getRankedDecisionData`
  wraps the normal `getDecisionData` with these timestamps plus the raw, as-entered inputs
  `rawFactorImportance` (each factor's 1-5 importance rating) and `rawScores` (each
  factor/option cell's 1-5 Likert rating) - `scores`/`waddScores` from `getDecisionData`
  stay normalized to -1..1 for the chart/WADD math, so the raw fields are what to read for
  "what did they actually type/select."
- `rankedDecisionWorkflow.ts`'s `finalize()` computes `totalTimeInAppMs` (mount to
  ranking-recorded) and `timeToFirstChoiceMs` (result-shown to their first/top choice,
  tracked via `firstChoiceAt` - set on the first option button clicked anywhere in the
  flow, since rank 1 is always asked first), then builds the full `RankedDecisionPayload`
  (topic, options, factors, raw + normalized scores, full ranking, timing), stores it to
  `localStorage`, and - the actual Qualtrics path - `postMessage`s
  `{ source: "decisionLayoutApp", type: "decisionComplete", payload }` to `window.parent`
  (a no-op if not iframed). No `.json` file is ever auto-downloaded (removed - it predated
  the postMessage path and would've been an odd mid-survey download prompt). A matching
  script on the Qualtrics question page needs to listen for that message and call
  `Qualtrics.SurveyEngine.setEmbeddedData(...)` - that half lives in the Qualtrics survey
  itself, not this repo.

## Conventions to follow
- No local dev environment on the user's end — everything goes through GitHub's web
  editor and Amplify's auto-deploy, so a PR needs to be complete and self-contained.
- Match existing code style: plain DOM manipulation (`document.createElement`,
  `.innerHTML` template strings), no framework, minimal external dependencies beyond d3.
- When touching shared files (especially `layoutBuilderFactory.ts`), double check other
  layouts still behave as before unless a change is explicitly meant to apply everywhere.
