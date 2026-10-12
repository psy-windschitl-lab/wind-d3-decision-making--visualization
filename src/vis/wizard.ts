import { createBuilderLayout } from "./layoutBuilderFactory";

export const meta = { name: "wizard" };

// Identical to GP4 in every respect (same tutorial, same "YOUR Layout" reveal page/copy,
// same one-at-a-time Step 4 with the per-factor intro - see the isGp2 checks in
// layoutBuilderFactory.ts, which also cover "wizard"). Kept as its own file/layout name
// only so a future, wizard-specific change to the ending flow can be made here without
// touching gp4.ts.
export default createBuilderLayout({ previewMode: "after-finish", kind: "chart", step4Style: "sequentialWithFactorIntro" });
