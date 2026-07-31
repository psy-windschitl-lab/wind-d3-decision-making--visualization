import { createBuilderLayout } from "./layoutBuilderFactory";

export const meta = { name: "GP2" };

// General Public 2 - a more user-friendly successor to GP1. Based on "wizard" (guided
// questions, no live preview - the layout only appears once Finish is clicked), but kept
// as its own file/layout name so GP2-specific touches (like the layout-interpretation
// tutorial) can be tuned without affecting the plain wizard flow.
export default createBuilderLayout({ previewMode: "after-finish", kind: "chart" });
