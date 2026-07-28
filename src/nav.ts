import type { PageCtx } from "./router";
import { resolveIntroVariant } from "./pages/intro";

// Rebuilt on every navigation (see router.ts), so it has access to the current URL
// (ctx.query / ctx.params) and can vary its content by whatever's currently in the URL.
export function renderNav(container: HTMLElement, ctx: PageCtx) {
  const isOnBuilder = location.pathname.replace(/\/+$/, "") === "/builder";
  const isResearch = (ctx.query.get("intro") || "").toLowerCase() === "intro2";

  // These three should "stick" as the person moves between pages within the app (e.g.
  // to About and back), not just persist while they stay on /builder - otherwise a
  // single trip to another page silently drops them, and Home ends up with nothing to
  // redirect on, landing on the chooser instead.
  const layout = ctx.query.get("layout");
  const wadd = ctx.query.get("wadd");
  const intro = ctx.query.get("intro");
  const carryQuery = layout && wadd
    ? `?layout=${layout}&wadd=${wadd}${intro ? `&intro=${intro}` : ""}`
    : "";

  container.innerHTML = `
    <a href="/${carryQuery}" id="navIntro">Introduction</a>
    <a href="/builder" id="navNewDecision">New Decision</a>
    ${isResearch ? "" : `<a href="/about${carryQuery}" data-link>About</a>`}
  `;

  // "New Decision": always asks for confirmation, and - if the current URL already has
  // all 3 variables set - returns to that exact same combination directly, skipping the
  // "Choose a Version" chooser, rather than sending the person through it again.
  const newDecisionLink = container.querySelector<HTMLAnchorElement>("#navNewDecision")!;
  newDecisionLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (!window.confirm("Are you sure you want to start on a new decision?")) return;
    const base = layout && wadd
      ? `/builder?layout=${layout}&wadd=${wadd}${intro ? `&intro=${intro}` : ""}`
      : "/builder";
    // Guarantees a fresh render even if this is the exact same URL the person is
    // already on, which the router would otherwise silently treat as a no-op.
    const target = `${base}${base.includes("?") ? "&" : "?"}_r=${Date.now()}`;
    ctx.navigate(target);
  });

  // "Introduction": if the person is currently mid-decision (on /builder), show the
  // intro content as an overlay on top of the current page instead of navigating away,
  // so their in-progress work isn't lost - with a way to return to it. Otherwise, this
  // navigates to Home, carrying the current variables forward so Home can go straight
  // back into the tool rather than showing the chooser.
  const introLink = container.querySelector<HTMLAnchorElement>("#navIntro")!;
  introLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (isOnBuilder) {
      showIntroOverlay(ctx);
    } else {
      ctx.navigate(`/${carryQuery}`);
    }
  });
}

function showIntroOverlay(ctx: PageCtx) {
  const introParam = ctx.query.get("intro");
  const resolved = resolveIntroVariant(introParam) ?? resolveIntroVariant("Intro1")!;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const dialog = document.createElement("div");
  dialog.className = "modal";
  dialog.style.width = "min(560px, 92vw)";

  const heading = document.createElement("h4");
  heading.textContent = resolved.variant.title;
  dialog.appendChild(heading);

  const body = document.createElement("div");
  body.innerHTML = resolved.variant.body;
  dialog.appendChild(body);

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "modal-actions";
  const returnBtn = document.createElement("button");
  returnBtn.className = "modal-btn";
  returnBtn.type = "button";
  returnBtn.textContent = "Return to your decision";
  returnBtn.addEventListener("click", () => overlay.remove());
  actionsWrap.appendChild(returnBtn);
  dialog.appendChild(actionsWrap);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}
