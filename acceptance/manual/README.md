# `jasper-living-docs` — the living-documentation manual generator

Turns a **Cucumber JSON** test feed into an **Astro Starlight** user manual (a
browsable static site) and a **print-ready PDF**. This is the first demonstration
of *living documentation* for Jasper: the acceptance suite's own run produces the
manual, so the manual cannot drift from the product.

## The pipeline

```
../cucumber-report/*.json     ← the data contract (from cucumberReporter('json'))
  → npm run generate          ← engine: JSON → per-feature MDX + extracted screenshots
  → npm run build             ← astro build → dist/ (static Starlight site)
  → npm run pdf               ← Playwright prints dist/print → manual.pdf
  (npm run manual = all three)
```

## Layout — and what is *extractable*

This package is deliberately split so the reusable engine can later be lifted into
its own repo/npm package without change:

| Path | Role | Generic? |
|---|---|---|
| `src/engine/` | Cucumber JSON → normalized model → MDX + assets | **yes** — knows nothing about Jasper |
| `src/components/` | Astro components that render the model | **yes** |
| `src/styles/` | manual + print CSS | **yes** |
| `src/pages/print.astro` | single-page render for PDF | **yes** |
| `src/content/docs/` | authored manual prose (`index.mdx`, …) | **no** — product-specific |
| `astro.config.mjs` | site title, sidebar, theme | **no** — product-specific |

**The extraction boundary is the input contract:** the engine consumes only the
Cucumber JSON described in `src/engine/cucumberJson.ts`. Nothing under `engine/`
or `components/` imports anything from the acceptance harness or from Jasper — the
two sides communicate solely through the on-disk JSON feed. To reuse this for a
different product, take `src/engine`, `src/components`, `src/styles`,
`src/pages/print.astro`, and the Astro/Starlight scaffolding; replace
`src/content` and `astro.config.mjs`.

## Generated, not committed

`src/generated/`, `src/content/docs/features/`, and `public/screens/` are written
by `npm run generate` and are git-ignored. `npm run generate` clears and rewrites
them from the current Cucumber feed every time.

## Import aliases

`@engine/*`, `@components/*`, `@generated/*` (see `tsconfig.json`) keep the
generated MDX imports stable regardless of page depth.
