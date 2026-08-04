import type { Page } from "../router";

const About: Page = (root) => {
  root.innerHTML = `
    <section class="card">
      <h1 class="h1">About</h1>
      <p>Framework-free, TypeScript-first, D3-powered decision-visualization app.</p>
      <p>Works only on desktops/laptops, not cell phones.</p>
    </section>`;
};

export default About;
