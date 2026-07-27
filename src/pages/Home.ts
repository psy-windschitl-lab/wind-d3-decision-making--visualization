import type { Page } from "../router";
import { renderVersionChooser } from "./chooser";

// Independent of layout/wadd - selected via its own "intro" URL parameter (e.g.
// ?intro=default), so intro wording can vary without needing to also specify a
// layout/wadd combination. Add more entries here as new intro variants are needed.
const INTRO_VARIANTS: Record<string, { title: string; body: string }> = {
  default: {
    title: "Decision Maker V1",
    body: `
      <p>This tool helps people make decisions when there are many options, many factors to consider, and they all matter to different extents for every individual. One example might be how to choose which apartment is best for you from several options, but this can apply to almost any tough decision.</p>
      <p>There are three main stages to build your layout.</p>
      <p>1. You specify your different options</p>
      <p>2. You determine what factors to consider and which are the most important to you.</p>
      <p>3. Use the built layout to guide your decision.</p>
      <p style="color:var(--muted); font-size:0.9em">Best used on a desktop or laptop browser.</p>
    `,
  },
};

const Home: Page = (root, ctx) => {
  const layoutParam = ctx.query.get("layout");
  const waddParam = ctx.query.get("wadd");
  if (layoutParam && waddParam) {
    // A fully-specified deep link landed on the root URL - go straight into the tool
    // rather than showing the intro/chooser first.
    const introParam = ctx.query.get("intro");
    const extra = introParam ? `&intro=${introParam}` : "";
    ctx.navigate(`/builder?layout=${layoutParam}&wadd=${waddParam}${extra}`);
    return;
  }

  const introKey = (ctx.query.get("intro") || "default").toLowerCase();
  const variant = INTRO_VARIANTS[introKey] ?? INTRO_VARIANTS.default;

  root.innerHTML = `
    <section class="card">
      <h1 class="h1">${variant.title}</h1>
      ${variant.body}
    </section>
  `;

  // No embeddings at all (no layout/wadd) - land on the same version chooser used by
  // the Layout Builder page, so this page doubles as the entry point into it.
  renderVersionChooser(root, ctx);
};

export default Home;
