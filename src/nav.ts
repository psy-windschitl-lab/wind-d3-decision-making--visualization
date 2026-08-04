import type { PageCtx } from "./router";
import { resolveIntroVariant, GP_MORE_INFO_TITLE, GP_MORE_INFO_BODY } from "./pages/intro";

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
    ${isResearch ? "" : `<a href="/about${carryQuery}" id="navAbout">About</a>`}
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

  // "Introduction" and "About" both behave as overlays on top of the current page while
  // the person is mid-decision (on /builder), instead of a real page navigation - a real
  // navigation would unmount the builder entirely and silently lose all their in-progress
  // answers, since nothing is persisted outside that page's own in-memory state. Once
  // they're not mid-decision, these are just normal links.
  const introLink = container.querySelector<HTMLAnchorElement>("#navIntro")!;
  introLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (isOnBuilder) {
      showIntroOverlay(ctx);
    } else {
      ctx.navigate(`/${carryQuery}`);
    }
  });

  const aboutLink = container.querySelector<HTMLAnchorElement>("#navAbout");
  if (aboutLink) {
    aboutLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (isOnBuilder) {
        showAboutOverlay();
      } else {
        ctx.navigate(`/about${carryQuery}`);
      }
    });
  }
}

function openOverlay(title: string, bodyHtml: string, actionsHtml: string, wire: (dialog: HTMLElement) => void) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const dialog = document.createElement("div");
  dialog.className = "modal";
  dialog.style.width = "min(560px, 92vw)";
  dialog.innerHTML = `
    <h4>${title}</h4>
    <div>${bodyHtml}</div>
    <div class="modal-actions">${actionsHtml}</div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  wire(dialog);
  return overlay;
}

function showAboutOverlay() {
  openOverlay(
    "About",
    `
      <p>Framework-free, TypeScript-first, D3-powered decision-visualization app.</p>
      <p>Works only on desktops/laptops, not cell phones.</p>
      <div style="margin-top:20px">
        <p style="margin:0"><strong>Designer:</strong><br>Paul Windschitl</p>
        <p style="margin:16px 0 0"><strong>Initial Codebase Developer:</strong><br>Zackary Gilliam</p>
        <p style="margin:16px 0 0"><strong>Other Conceptual &amp; Codebase Contributions:</strong><br>
          Piper Clark<br>
          Juan Pablo Hourcade<br>
          Jeremy Strueder<br>
          Elke Windschitl
        </p>
      </div>
    `,
    `<button id="aboutReturnBtn" class="modal-btn">Return to your decision</button>`,
    (dialog) => {
      dialog.querySelector<HTMLButtonElement>("#aboutReturnBtn")!.onclick = () => {
        dialog.closest(".modal-overlay")!.remove();
      };
    }
  );
}

function showIntroOverlay(ctx: PageCtx) {
  const introParam = ctx.query.get("intro");
  const resolved = resolveIntroVariant(introParam) ?? resolveIntroVariant("Intro1")!;
  const isGP1 = resolved.key === "intro1";

  const overlay = openOverlay(
    resolved.variant.title,
    resolved.variant.body,
    `
      ${isGP1 ? `<button id="introMoreBtn" class="modal-btn modal-btn--secondary">See More Introductory Information</button>` : ""}
      <button id="introReturnBtn" class="modal-btn">Return to your decision</button>
    `,
    (dialog) => {
      dialog.querySelector<HTMLButtonElement>("#introReturnBtn")!.onclick = () => overlay.remove();
      const moreBtn = dialog.querySelector<HTMLButtonElement>("#introMoreBtn");
      if (moreBtn) {
        moreBtn.onclick = () => {
          overlay.remove();
          showGPMoreInfoOverlay();
        };
      }
    }
  );
}

function showGPMoreInfoOverlay() {
  openOverlay(
    GP_MORE_INFO_TITLE,
    GP_MORE_INFO_BODY,
    `<button id="moreInfoReturnBtn" class="modal-btn">Return to your decision</button>`,
    (dialog) => {
      dialog.querySelector<HTMLButtonElement>("#moreInfoReturnBtn")!.onclick = () => {
        dialog.closest(".modal-overlay")!.remove();
      };
    }
  );
}
