import { createBuilderLayout } from "./layoutBuilderFactory";

export const meta = { name: "GP3" };

// Same as GP2 (same tutorial, same "YOUR Layout" reveal page/copy - see the isGp2 checks
// in layoutBuilderFactory.ts, which also cover "gp3"), except Step 4 asks one rating
// question at a time instead of grouping every option for a factor together under one
// shared scale legend - see the "sequential" branch in layoutBuilderFactory.
export default createBuilderLayout({ previewMode: "after-finish", kind: "chart", step4Style: "sequential" });
