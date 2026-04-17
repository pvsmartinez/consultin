# Consultin — Backlog

## Testing

### Add axe-core accessibility testing

- **Package:** `vitest-axe` (wraps axe-core, works with Vitest + jsdom — no extra Jest config needed)
- **Install:** `npm install -D vitest-axe axe-core`
- **Usage:**

  ```typescript
  import { axe, toHaveNoViolations } from "vitest-axe";
  expect.extend(toHaveNoViolations);

  it("has no a11y violations", async () => {
    const { container } = renderPage();
    expect(await axe(container)).toHaveNoViolations();
  });
  ```

- **Priority pages to cover first:** CadastroClinicaPage, AgendarConsultaPage, PatientDetailPage (public-facing or high-traffic)
- **What it catches:** missing `alt` text, forms without labels, insufficient color contrast, missing ARIA roles, keyboard navigation issues — WCAG 2.1 AA
- **Note:** Expect initial failures. Treat first run as an audit. Fix violations by priority (critical → serious → moderate).

## Features

<!-- Add new feature ideas here -->

## Refactoring

<!-- Add refactoring ideas here -->
