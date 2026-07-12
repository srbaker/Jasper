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

/** A step as one text line for the collapsed list; `shown` marks the step whose
 *  screenshot is the one on display (the hero). */
function stepLine(step: ManualStep, shown: boolean): string {
  return (
    `<li class="sl${shown ? ' sl-shown' : ''}" data-status="${step.status}">` +
    `<span class="dot"></span><span class="kw">${esc(step.keyword)}</span><span class="txt">${esc(step.text)}</span>` +
    `${shown ? '<span class="shown-tag">shown →</span>' : ''}` +
    `</li>`
  );
}

/** A step paired with its own screenshot(s) — the drill-down detail. */
function renderStepDetail(step: ManualStep): string {
  const shots = step.screenshots.length
    ? `<div class="shotgrid">` +
      step.screenshots.map((s) => `<img class="shot" loading="lazy" src="${esc(s.src)}" alt="${esc(s.name)}">`).join('') +
      `</div>`
    : `<div class="noshot">—</div>`;
  const err = step.error ? `<pre class="err">${esc(step.error)}</pre>` : '';
  return (
    `<li class="xstep" data-status="${step.status}">` +
    `<div class="xstep-line"><span class="dot"></span><span class="kw">${esc(step.keyword)}</span><span class="txt">${esc(step.text)}</span></div>` +
    `<div class="xstep-shots">${err}${shots}</div>` +
    `</li>`
  );
}

function renderScenario(sc: ManualScenario, annotate?: (t: string[]) => string[]): string {
  const notes = annotate?.(sc.tags) ?? [];
  const chips = notes.map((n) => `<span class="chip">${esc(n)}</span>`).join('');
  // The "hero" is the final captured state — the last screenshot of the last step
  // that has one (in practice the Then's result). Track which step it came from so
  // the collapsed view can label it and highlight that step.
  let heroStep: ManualStep | null = null;
  for (const s of sc.steps) if (s.screenshots.length) heroStep = s;
  const hero = heroStep ? heroStep.screenshots[heroStep.screenshots.length - 1] : null;
  const heroHtml = hero
    ? `<figure class="sc-hero">` +
      `<img class="shot" loading="lazy" src="${esc(hero.src)}" alt="${esc(hero.name)}">` +
      `<figcaption class="hero-cap"><span class="kw">${esc(heroStep!.keyword)}</span> ${esc(heroStep!.text)}</figcaption>` +
      `</figure>`
    : `<div class="sc-hero sc-hero-empty">No screenshot</div>`;
  const desc = sc.description ? `<p class="desc">${esc(sc.description)}</p>` : '';
  return (
    `<details class="scenario" data-status="${sc.status}">` +
    `<summary>` +
    `<div class="sc-head"><span class="dot"></span><span class="sc-name">${esc(sc.name)}</span>` +
    `${chips ? `<span class="sc-chips">${chips}</span>` : ''}<span class="chev"></span></div>` +
    `<div class="sc-collapsed"><ol class="sc-steps">${sc.steps.map((s) => stepLine(s, s === heroStep)).join('')}</ol>${heroHtml}</div>` +
    `</summary>` +
    `<div class="sc-expanded">${desc}<ol class="xsteps">${sc.steps.map(renderStepDetail).join('')}</ol></div>` +
    `</details>`
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
  </div>
  ${opts.generatedAt ? `<p class="stamp">Generated ${esc(opts.generatedAt)}</p>` : ''}
</header>
<nav class="toc"><h2>Contents</h2><ul>${toc}</ul></nav>
<main>${body}</main>
<div id="lightbox" class="lb" hidden><img alt=""></div>
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
.desc{color:var(--muted);margin:.25rem 0}
.chip{font-size:.78rem;padding:.05rem .55rem;border:1px solid var(--line);border-radius:999px;background:#f6f6f6}
.kw{color:var(--muted);font-weight:600;font-size:.82rem;min-width:3rem;display:inline-block}
.dot{width:.55rem;height:.55rem;border-radius:50%;flex:none;background:var(--skip);transform:translateY(.05rem)}
[data-status=passed]>.dot,[data-status=passed]>h3>.dot,[data-status=passed]>summary .sc-head>.dot,.xstep[data-status=passed] .dot{background:var(--pass)}
[data-status=failed]>.dot,[data-status=failed]>h3>.dot,[data-status=failed]>summary .sc-head>.dot,.xstep[data-status=failed] .dot{background:var(--fail)}
/* Scenario card: collapsed = steps ‖ final Then shot; open = per-step drill-down */
.scenario{border:1px solid var(--line);border-radius:8px;margin:.6rem 0;overflow:hidden}
.scenario>summary{cursor:pointer;list-style:none;padding:.6rem .8rem}
.scenario>summary::-webkit-details-marker{display:none}
.scenario>summary:hover{background:#fafafa}
.sc-head{display:flex;align-items:center;gap:.5rem}
.sc-name{font-weight:600}
.sc-chips{display:flex;gap:.3rem;flex-wrap:wrap}
.chev{margin-left:auto;width:0;height:0;border-left:6px solid var(--muted);border-top:5px solid transparent;border-bottom:5px solid transparent;transition:transform .15s}
.scenario[open]>summary .chev{transform:rotate(90deg)}
.sc-collapsed{display:grid;grid-template-columns:minmax(14rem,1fr) minmax(0,1.4fr);gap:1.2rem;margin-top:.6rem;align-items:start}
.scenario[open]>summary .sc-collapsed{display:none}
.sc-steps{list-style:none;margin:0;padding:0;font-size:.92rem}
.sc-steps .sl{display:flex;align-items:baseline;gap:.4rem;padding:.12rem 0}
.sl-shown{font-weight:600}
.sl-shown .kw{color:var(--fg)}
.shown-tag{margin-left:auto;font-size:.72rem;font-weight:600;color:var(--pass);white-space:nowrap}
.sc-hero{margin:0}
.sc-hero img{width:100%;border:1px solid var(--line);border-top-left-radius:6px;border-top-right-radius:6px;display:block}
.hero-cap{font-size:.8rem;color:var(--muted);padding:.35rem .5rem;border:1px solid var(--line);border-top:0;border-radius:0 0 6px 6px;background:#fafafa}
.hero-cap .kw{color:var(--pass);min-width:auto;margin-right:.15rem}
.sc-hero-empty{color:var(--muted);font-size:.85rem;display:flex;align-items:center;justify-content:center;border:1px dashed var(--line);border-radius:6px;min-height:6rem}
.shot{cursor:zoom-in}
.lb{position:fixed;inset:0;background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;padding:2rem;z-index:20;cursor:zoom-out}
.lb[hidden]{display:none}
.lb img{max-width:100%;max-height:100%;border-radius:4px;box-shadow:0 8px 48px rgba(0,0,0,.5)}
.sc-expanded{padding:.5rem .8rem .8rem;border-top:1px solid var(--line)}
.xsteps{list-style:none;margin:0;padding:0}
.xstep{display:grid;grid-template-columns:minmax(12rem,1fr) minmax(0,1.4fr);gap:1.2rem;padding:.55rem 0;border-bottom:1px solid var(--line);align-items:start}
.xstep:last-child{border-bottom:0}
.xstep-line{display:flex;align-items:baseline;gap:.4rem;font-size:.92rem}
.shotgrid{display:flex;flex-wrap:wrap;gap:.5rem}
.shotgrid img{width:100%;border:1px solid var(--line);border-radius:6px;display:block}
.noshot{color:var(--muted)}
.err{background:#fff4f4;border:1px solid #f3c2c2;color:var(--fail);padding:.5rem;border-radius:6px;white-space:pre-wrap;font-size:.8rem;overflow:auto;margin-bottom:.5rem}
@media (max-width:800px){body{grid-template-columns:1fr;grid-template-areas:"head" "nav" "main"}nav.toc{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--line)}.sc-collapsed,.xstep{grid-template-columns:1fr;gap:.6rem}}
@media print{nav.toc,.controls{display:none}body{display:block}}
`;

const JS = `
document.querySelector('.controls').addEventListener('click',function(e){
  var act=e.target.getAttribute('data-act'); if(!act) return;
  var open=act==='expand';
  document.querySelectorAll('main details.scenario').forEach(function(d){d.open=open});
});
// Clicking a screenshot zooms it in a lightbox — and must NOT toggle the card
// (the hero lives inside the scenario's <summary>), so cancel the default toggle.
var lb=document.getElementById('lightbox'), lbImg=lb.querySelector('img');
document.querySelector('main').addEventListener('click',function(e){
  var img=e.target.closest('img.shot'); if(!img) return;
  e.preventDefault(); e.stopPropagation();
  lbImg.src=img.currentSrc||img.src; lb.hidden=false;
});
function closeLb(){lb.hidden=true;lbImg.removeAttribute('src');}
lb.addEventListener('click',closeLb);
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!lb.hidden)closeLb();});
`;
