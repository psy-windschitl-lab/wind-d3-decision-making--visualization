import { createBuilderLayout } from "./layoutBuilderFactory";

export const meta = { name: "GP1" };

// Most similar to "vanilla" (guided questions, live-updating layout preview), but the
// preview is read-only (no dragging/reordering/renaming) and the chart-note/WADD control
// are hidden until Finish is clicked.
export default createBuilderLayout({ previewMode: "live", kind: "chart", restrictPreviewUntilFinish: true });
