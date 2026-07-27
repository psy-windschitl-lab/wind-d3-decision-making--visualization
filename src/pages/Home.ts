import type { Page } from "../router";
import { renderVersionChooser } from "./chooser";

const Home: Page = (root, ctx) => {
  const layoutParam = ctx.query.get("layout");
  const waddParam = ctx.query.get("wadd");
  const introParam = ctx.query.get("intro");
  if (layoutParam && waddParam) {
    // A fully-specified deep link landed on the root URL - go straight to the builder
    // (which shows the intro panel itself, if an intro variant is included) rather than
    // showing the chooser here too.
    const extra = introParam ? `&intro=${introParam}` : "";
    ctx.navigate(`/builder?layout=${layoutParam}&wadd=${waddParam}${extra}`);
    return;
  }

  // No embeddings at all - land on the same version chooser used by the Layout Builder
  // page, so this page doubles as the entry point into it.
  renderVersionChooser(root, ctx);
};

export default Home;
