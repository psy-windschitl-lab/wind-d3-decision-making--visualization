import { createBuilderLayout } from "./layoutBuilderFactory";

export const meta = { name: "GP4" };

// Same as GP2/GP3 (same tutorial, same "YOUR Layout" reveal page/copy - see the isGp2
// checks in layoutBuilderFactory.ts, which also cover "gp4"). Like GP3, Step 4 asks one
// rating question at a time, but each factor first gets its own two-line intro (shown
// once, before that factor's questions) instead of every question re-naming the factor -
// see the "sequentialWithFactorIntro" branch in layoutBuilderFactory.
export default createBuilderLayout({ previewMode: "after-finish", kind: "chart", step4Style: "sequentialWithFactorIntro" });
