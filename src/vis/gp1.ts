import { createBuilderLayout } from "./layoutBuilderFactory";

export const meta = { name: "GP1" };

// Most similar to "vanilla" (guided questions, live-updating layout preview). Adjust
// this config - or replace the whole file with custom behavior - if GP1 should differ
// from vanilla in some specific way beyond this starting point.
export default createBuilderLayout({ previewMode: "live", kind: "chart" });
