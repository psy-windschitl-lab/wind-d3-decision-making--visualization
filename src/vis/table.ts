import { createBuilderLayout } from "./layoutBuilderFactory";

export const meta = { name: "table" };

// Same as "wizard" (same tutorial, same "YOUR Layout" reveal page/copy, same one-at-a-time
// Step 4 with the per-factor intro, same inline ranking instead of a pick-an-option popup
// - see the isGp2 checks in layoutBuilderFactory.ts, which also cover "table"), except the
// area where wizard shows a chart instead shows a table (kind: "table"), and the tutorial's
// opening line is swapped to promise a table instead of a layout (see tutorialOptions in
// layoutBuilderFactory.ts).
export default createBuilderLayout({
  previewMode: "after-finish",
  kind: "table",
  step4Style: "sequentialWithFactorIntro",
  decisionFlow: "rankedInline",
});
