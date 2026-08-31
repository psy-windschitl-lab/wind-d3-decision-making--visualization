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
  two-line intro before its one-at-a-time questions).
- `src/lib/vis.ts` — the real `DecisionLayoutChart` D3 component (rows = factors, height
  proportional to importance weight; columns = options; cells fill green/brown based on
  score). `src/DecisionLayoutChart.ts` is an older/simpler version — don't confuse the two;
  the factory and tutorial both import from `src/lib/vis.ts`.
- `src/lib/layoutTutorial.ts` — the "how to read your layout" walkthrough using a fixed
  fictional example (Julie's apartment decision), built by mounting the real chart
  component in read-only mode and measuring its rendered DOM to position highlight
  callouts. **Currently GP2/GP3/GP4-only** — gated in `layoutBuilderFactory.ts` via the
  `isGp2` variable (`root.parentElement?.dataset.layout` being `"gp2"`, `"gp3"`, or
  `"gp4"`). Don't let it leak into other layouts (wizard, GP1, etc.) unless explicitly
  asked to expand its scope.
- `src/pages/chooser.ts` — the "Choose a Version" picker; layout options are described
  here for end users.
- Query params driving behavior: `layout` (wizard/vanilla/gp1/gp2/gp3/gp4/manual/table),
  `wadd` (always/off/toggleable), `intro` (which intro page).

## Conventions to follow
- No local dev environment on the user's end — everything goes through GitHub's web
  editor and Amplify's auto-deploy, so a PR needs to be complete and self-contained.
- Match existing code style: plain DOM manipulation (`document.createElement`,
  `.innerHTML` template strings), no framework, minimal external dependencies beyond d3.
- When touching shared files (especially `layoutBuilderFactory.ts`), double check other
  layouts still behave as before unless a change is explicitly meant to apply everywhere.
