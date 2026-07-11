# Jasper acceptance suite — living documentation

Gherkin-authored, UI-driven acceptance tests that drive a **sandboxed VS Code**
with the Jasper extension loaded from source, and whose output is a
screenshot-rich **user manual** (an Astro Starlight site + PDF). The same run that
verifies behaviour produces the documentation — so the manual can't drift from the
product.

## Run it

```sh
mise install            # once: pins node for this workspace (no Java, no Docker)
npm install             # once
npm test                # bddgen → Playwright drives VS Code → Cucumber JSON feed
npm run manual          # generate the manual (Astro site + PDF) from the last run
```

- On macOS the editor runs **off-screen** (accessory app) — no window appears.
- Headless CI: `npm run test:ci` (`xvfb-run`).
- The editor is **sandboxed**: pinned VS Code version, throwaway user-data /
  extensions / `HOME` / `TMPDIR` / `XDG_*`, a minimal env allowlist (no host
  config leaks in), in-memory secret storage (never the login Keychain), telemetry
  off. See `fixtures/vscode.ts`.

## Pipeline

```
features/*.feature (Gherkin)
  → playwright-bdd (bddgen)                       # compile to Playwright specs
  → Playwright _electron + @vscode/test-electron  # sandboxed VS Code + Jasper
  → AfterStep screenshot → step embeddings        # per-step evidence
  → cucumberReporter('json') → cucumber-report/   # the data contract
  → manual/ (generator → Astro Starlight → PDF)   # the living-documentation manual
```

## Layout

| Path | Role |
|---|---|
| `features/` | `*.feature` — the Gherkin scenarios (the manual's source) |
| `steps/` | step definitions, thin over the page objects |
| `fixtures/` | Playwright fixtures — `vscode.ts` (sandboxed launch), `test.ts` |
| `support/` | the per-step screenshot hook |
| `pageobjects/` | thin POM over the workbench (`.monaco-*` / ARIA locators) |
| `manual/` | the extractable living-documentation generator (own README) |

Stone-backed scenarios expect a test stone from the repo's
`npm run test:server:start` (writes `client/.env.test`); scenarios tagged
`@stone` skip when none is provisioned.
