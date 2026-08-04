import type { Page } from "../router";

const About: Page = (root) => {
  root.innerHTML = `
    <section class="card">
      <h1 class="h1">About</h1>
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
    </section>`;
};

export default About;
