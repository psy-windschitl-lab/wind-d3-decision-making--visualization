import { createBuilderLayout } from "./layoutBuilderFactory";

export const meta = { name: "wizard" };

// Same as GP4 (same tutorial, same "YOUR Layout" reveal page/copy, same one-at-a-time
// Step 4 with the per-factor intro - see the isGp2 checks in layoutBuilderFactory.ts,
// which also cover "wizard"), except for how the ending flow works: instead of a modal
// dialog that covers the layout while picking an option, wizard builds a full preference
// ranking inline, right below the layout - see attachRankedDecisionWorkflow in
// src/lib/rankedDecisionWorkflow.ts.
export default createBuilderLayout({
  previewMode: "after-finish",
  kind: "chart",
  step4Style: "sequentialWithFactorIntro",
  decisionFlow: "rankedInline",
});
