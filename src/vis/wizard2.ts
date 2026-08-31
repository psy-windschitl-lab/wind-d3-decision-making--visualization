import { createBuilderLayout } from "./layoutBuilderFactory";

export const meta = { name: "wizard with new questions" };

// Same as "wizard" (guided questions, no live preview) except Step 4 asks one rating
// question at a time instead of grouping every option for a factor together under one
// shared scale legend - see the sequentialRatingQuestions branch in layoutBuilderFactory.
export default createBuilderLayout({ previewMode: "after-finish", kind: "chart", sequentialRatingQuestions: true });
