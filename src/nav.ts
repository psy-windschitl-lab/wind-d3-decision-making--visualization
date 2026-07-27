import type { PageCtx } from "./router";

// Rebuilt on every navigation (see router.ts), so it has access to the current URL
// (ctx.query / ctx.params) and can vary its content by whatever's currently in the URL -
// e.g. a different link set for certain layout/wadd combinations. For now it renders the
// same three links regardless of the URL; update the logic below once there's a spec for
// what should actually differ.
export function renderNav(container: HTMLElement, ctx: PageCtx) {
  container.innerHTML = `
    <a href="/" data-link>Home</a>
    <a href="/builder" data-link>Layout Builder</a>
    <a href="/about" data-link>About</a>
  `;
}
