/**
 * Render the manual model as a single self-contained HTML page — the Cucumber
 * report, formatted. No framework: native <details>/<summary> disclosure, a bit
 * of vanilla JS for expand/collapse/show-all, inline CSS, and <img> tags that
 * link the screenshot files on disk (written next to this page under screens/).
 *
 * Generic: knows nothing about Jasper. Product specifics arrive as options (the
 * title, the section order, the tag→notes annotator).
 */
import type { Manual, ManualFeature, ManualScenario, ManualStep } from './model.js';

/** A named, ordered group of chapters (by Feature name) — the table of contents. */
export interface Section {
  title: string;
  chapters: string[];
}

export interface RenderOptions {
  title: string;
  generatedAt?: string;
  /** Section order from the `.chapters` dotfile. Omit for a flat, file-order list. */
  sections?: Section[];
  /** Map a scenario's tags to human "runs against" notes (extent, user, …). */
  annotate?: (tags: string[]) => string[];
}

interface OutlineGroup {
  title?: string;
  features: ManualFeature[];
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Order features into the sections named in the outline; unlisted ones trail under "More". */
function group(features: ManualFeature[], sections?: Section[]): OutlineGroup[] {
  if (!sections?.length) return [{ features }];
  const byName = new Map(features.map((f) => [f.name, f]));
  const placed = new Set<string>();
  const groups: OutlineGroup[] = [];
  for (const section of sections) {
    const picked: ManualFeature[] = [];
    for (const name of section.chapters) {
      const f = byName.get(name);
      if (f && !placed.has(f.slug)) {
        placed.add(f.slug);
        picked.push(f);
      }
    }
    if (picked.length) groups.push({ title: section.title, features: picked });
  }
  const rest = features.filter((f) => !placed.has(f.slug));
  if (rest.length) groups.push({ title: 'More', features: rest });
  return groups;
}

function renderStep(step: ManualStep): string {
  const shots = step.screenshots.length
    ? `<details class="shots"><summary>${step.screenshots.length} screenshot${step.screenshots.length === 1 ? '' : 's'}</summary>` +
      `<div class="shotgrid">` +
      step.screenshots.map((s) => `<a href="${esc(s.src)}"><img loading="lazy" src="${esc(s.src)}" alt="${esc(s.name)}"></a>`).join('') +
      `</div></details>`
    : '';
  const err = step.error ? `<pre class="err">${esc(step.error)}</pre>` : '';
  return (
    `<li><details class="step" data-status="${step.status}">` +
    `<summary><span class="dot"></span><span class="kw">${esc(step.keyword)}</span> ${esc(step.text)}</summary>` +
    `<div class="step-body">${err}${shots}</div>` +
    `</details></li>`
  );
}

function renderScenario(sc: ManualScenario, annotate?: (t: string[]) => string[]): string {
  const notes = annotate?.(sc.tags) ?? [];
  const anno = notes.length
    ? `<p class="anno"><span class="anno-label">Runs against</span>${notes.map((n) => `<span class="chip">${esc(n)}</span>`).join('')}</p>`
    : '';
  const desc = sc.description ? `<p class="desc">${esc(sc.description)}</p>` : '';
  return (
    `<section class="scenario" data-status="${sc.status}">` +
    `<h4><span class="dot"></span>${esc(sc.name)}</h4>${anno}${desc}` +
    `<ol class="steps">${sc.steps.map(renderStep).join('')}</ol>` +
    `</section>`
  );
}

function renderFeature(f: ManualFeature, annotate?: (t: string[]) => string[]): string {
  const desc = f.description ? `<p class="desc">${f.description.split('\n').map(esc).join('<br>')}</p>` : '';
  return (
    `<section class="feature" id="${esc(f.slug)}" data-status="${f.status}">` +
    `<h3><span class="dot"></span>${esc(f.name)}</h3>${desc}` +
    f.scenarios.map((s) => renderScenario(s, annotate)).join('') +
    `</section>`
  );
}

export function renderHtml(manual: Manual, opts: RenderOptions): string {
  const groups = group(manual.features, opts.sections);
  const toc = groups
    .map(
      (g) =>
        (g.title ? `<li class="toc-section">${esc(g.title)}<ul>` : '<li><ul>') +
        g.features.map((f) => `<li><a href="#${esc(f.slug)}">${esc(f.name)}</a></li>`).join('') +
        '</ul></li>',
    )
    .join('');
  const body = groups
    .map(
      (g) =>
        (g.title ? `<h2 class="section">${esc(g.title)}</h2>` : '') +
        g.features.map((f) => renderFeature(f, opts.annotate)).join(''),
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>${esc(opts.title)}</h1>
  <div class="controls">
    <button data-act="expand">Expand all</button>
    <button data-act="collapse">Collapse all</button>
    <button data-act="shots">Show all screenshots</button>
  </div>
  ${opts.generatedAt ? `<p class="stamp">Generated ${esc(opts.generatedAt)}</p>` : ''}
</header>
<nav class="toc"><h2>Contents</h2><ul>${toc}</ul></nav>
<main>${body}</main>
<script>${JS}</script>
</body>
</html>
`;
}

const CSS = `
:root{--pass:#2e7d32;--fail:#c62828;--skip:#9e9e9e;--fg:#1a1a1a;--muted:#666;--line:#e2e2e2;--bg:#fff}
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--fg);background:var(--bg);
  display:grid;grid-template-columns:16rem 1fr;grid-template-areas:"head head" "nav main"}
header{grid-area:head;padding:1rem 1.5rem;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2;
  display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
h1{font-size:1.25rem;margin:0}
.controls{display:flex;gap:.5rem}
.controls button{font:inherit;font-size:.85rem;padding:.25rem .7rem;border:1px solid var(--line);border-radius:6px;background:#f6f6f6;cursor:pointer}
.controls button:hover{background:#ececec}
.stamp{color:var(--muted);font-size:.8rem;margin:0 0 0 auto}
nav.toc{grid-area:nav;padding:1rem;border-right:1px solid var(--line);position:sticky;top:4rem;align-self:start;max-height:calc(100vh - 4rem);overflow:auto}
nav.toc h2{font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
nav.toc ul{list-style:none;margin:0;padding:0}
nav.toc .toc-section{font-weight:600;margin-top:.75rem}
nav.toc .toc-section ul{font-weight:400}
nav.toc a{color:var(--fg);text-decoration:none;display:block;padding:.15rem 0 .15rem .75rem;font-size:.9rem}
nav.toc a:hover{color:var(--pass);text-decoration:underline}
main{grid-area:main;padding:1.5rem 2rem;max-width:60rem}
h2.section{font-size:1.5rem;border-bottom:2px solid var(--line);padding-bottom:.25rem;margin:2rem 0 1rem}
.feature{margin:0 0 2rem}
.feature>h3{font-size:1.2rem;margin:1.25rem 0 .25rem}
.scenario{margin:.75rem 0 1rem;padding-left:.25rem}
.scenario>h4{font-size:1rem;margin:.75rem 0 .35rem;font-weight:600}
.desc{color:var(--muted);margin:.25rem 0}
.anno{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:.25rem 0}
.anno-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.chip{font-size:.78rem;padding:.05rem .55rem;border:1px solid var(--line);border-radius:999px;background:#f6f6f6}
.steps{list-style:none;margin:.25rem 0;padding:0}
.step{border-left:2px solid var(--line);margin:.1rem 0}
.step>summary{cursor:pointer;padding:.15rem .5rem;list-style:none;display:flex;align-items:baseline;gap:.4rem}
.step>summary::-webkit-details-marker{display:none}
.step>summary:hover{background:#fafafa}
.kw{color:var(--muted);font-weight:600;font-size:.85rem;min-width:3.2rem;display:inline-block}
.dot{width:.6rem;height:.6rem;border-radius:50%;flex:none;background:var(--skip);transform:translateY(.05rem)}
[data-status=passed]>summary>.dot,[data-status=passed]>h3>.dot,[data-status=passed]>h4>.dot{background:var(--pass)}
[data-status=failed]>summary>.dot,[data-status=failed]>h3>.dot,[data-status=failed]>h4>.dot{background:var(--fail)}
.step-body{padding:.35rem .5rem .5rem 1.5rem}
.shots>summary{cursor:pointer;color:var(--muted);font-size:.85rem}
.shotgrid{display:flex;flex-wrap:wrap;gap:.5rem;margin:.5rem 0}
.shotgrid img{max-width:22rem;width:100%;border:1px solid var(--line);border-radius:6px}
.err{background:#fff4f4;border:1px solid #f3c2c2;color:var(--fail);padding:.5rem;border-radius:6px;white-space:pre-wrap;font-size:.8rem;overflow:auto}
@media (max-width:800px){body{grid-template-columns:1fr;grid-template-areas:"head" "nav" "main"}nav.toc{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--line)}}
@media print{nav.toc,.controls{display:none}body{display:block}.step,.shots{--x:0}details{}}
`;

const JS = `
document.querySelector('.controls').addEventListener('click',function(e){
  var act=e.target.getAttribute('data-act'); if(!act) return;
  if(act==='expand') document.querySelectorAll('main details').forEach(function(d){d.open=true});
  if(act==='collapse') document.querySelectorAll('main details').forEach(function(d){d.open=false});
  if(act==='shots') document.querySelectorAll('main details.shots').forEach(function(d){d.open=true;var s=d.closest('.step');if(s)s.open=true});
});
`;
