/**
 * Render the manual model as a single self-contained HTML page — a real,
 * illustrated user manual, not a test report. Each scenario reads as a
 * Given/When/Then walkthrough with its screenshots placed inline at the step
 * that produced them, and the final state called out as the "Result". No
 * framework: native <details>/<summary> disclosure (default open, so the page
 * reads top-to-bottom), a little vanilla JS for expand/collapse-all and a
 * zoom lightbox, inline CSS, and <img> tags linking the screenshot files on
 * disk (written next to this page under screens/).
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

/** Escape, then set quoted substrings as inline code — 'GemStone: …', '17 * 3'. */
const fmt = (s: string): string =>
  esc(s).replace(/'([^']*)'/g, (_m, inner: string) => `<code>'${inner}'</code>`);

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

/** One step of the walkthrough: the GWT line, then its screenshot(s) inline.
 *  `result` marks the last step that has a screenshot — the outcome, shown big. */
function renderStep(step: ManualStep, result: boolean): string {
  const err = step.error ? `<pre class="err">${esc(step.error)}</pre>` : '';
  const ds = step.docString ? `<pre class="docstring">${esc(step.docString)}</pre>` : '';
  const figs = step.screenshots.length
    ? `<div class="figs${result ? ' result' : ''}">` +
      (result ? `<span class="result-tag">Result</span>` : '') +
      step.screenshots
        .map((s) => `<figure class="fig"><img class="shot" loading="lazy" src="${esc(s.src)}" alt="${esc(s.name)}"></figure>`)
        .join('') +
      `</div>`
    : '';
  return (
    `<li class="step" data-kw="${esc(step.keyword.toLowerCase())}" data-status="${step.status}">` +
    `<div class="step-line"><span class="kw-pill">${esc(step.keyword)}</span><span class="step-text">${fmt(step.text)}</span></div>` +
    ds +
    err +
    figs +
    `</li>`
  );
}

function renderScenario(sc: ManualScenario, annotate?: (t: string[]) => string[]): string {
  const notes = annotate?.(sc.tags) ?? [];
  const chips = notes.map((n) => `<span class="chip">${esc(n)}</span>`).join('');
  // The outcome is the last step that captured a screenshot (in practice the Then).
  let lastShot = -1;
  sc.steps.forEach((s, i) => {
    if (s.screenshots.length) lastShot = i;
  });
  const hero = lastShot >= 0 ? sc.steps[lastShot].screenshots[sc.steps[lastShot].screenshots.length - 1] : null;
  // A small outcome thumbnail rides in the header — visible only when collapsed,
  // so "Collapse all" turns the manual into a scannable index of outcomes.
  const thumb = hero ? `<img class="sc-thumb shot" loading="lazy" src="${esc(hero.src)}" alt="">` : '';
  const desc = sc.description ? `<p class="sc-desc">${sc.description.split('\n').map(fmt).join('<br>')}</p>` : '';
  return (
    `<details class="scenario" open data-status="${sc.status}">` +
    `<summary>` +
    `<span class="dot"></span><h4 class="sc-title">${esc(sc.name)}</h4>` +
    `${chips ? `<span class="sc-chips">${chips}</span>` : ''}${thumb}<span class="chev"></span>` +
    `</summary>` +
    `<div class="sc-body">${desc}<ol class="walk">${sc.steps.map((s, i) => renderStep(s, i === lastShot)).join('')}</ol></div>` +
    `</details>`
  );
}

function renderFeature(f: ManualFeature, n: number, annotate?: (t: string[]) => string[]): string {
  const intro = f.description ? `<p class="chapter-intro">${f.description.split('\n').map(fmt).join('<br>')}</p>` : '';
  return (
    `<article class="chapter" id="${esc(f.slug)}" data-status="${f.status}">` +
    `<header class="chapter-head">` +
    `<p class="eyebrow">Chapter ${n}</p>` +
    `<h3 class="chapter-title">${esc(f.name)}</h3>` +
    intro +
    `</header>` +
    f.scenarios.map((s) => renderScenario(s, annotate)).join('') +
    `</article>`
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
  let chapterNo = 0;
  const body = groups
    .map(
      (g) =>
        (g.title ? `<h2 class="part">${esc(g.title)}</h2>` : '') +
        g.features.map((f) => renderFeature(f, (chapterNo += 1), opts.annotate)).join(''),
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
:root{
  --pass:#16a34a;--fail:#dc2626;--skip:#9aa0a6;
  --given:#64748b;--when:#2563eb;--then:#16a34a;
  --fg:#1c2128;--muted:#5b6570;--faint:#8a929c;
  --line:#e6e8eb;--bg:#ffffff;--panel:#f7f8fa;--accent:#2563eb;
  --serif:Iowan Old Style,Palatino Linotype,Palatino,Georgia,serif;
  --sans:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
}
@media (prefers-color-scheme:dark){:root{
  --pass:#3fb950;--fail:#f85149;--skip:#6e7681;
  --given:#8b96a5;--when:#58a6ff;--then:#3fb950;
  --fg:#e6edf3;--muted:#9aa4b2;--faint:#6e7681;
  --line:#262b33;--bg:#0d1117;--panel:#161b22;--accent:#58a6ff;
}}
*{box-sizing:border-box}
body{margin:0;font:16px/1.6 var(--sans);color:var(--fg);background:var(--bg);
  display:grid;grid-template-columns:17rem 1fr;grid-template-areas:"head head" "nav main"}
header{grid-area:head;padding:.9rem 1.6rem;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:5;
  display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
h1{font-family:var(--serif);font-size:1.35rem;font-weight:600;margin:0;letter-spacing:.01em}
.controls{display:flex;gap:.5rem}
.controls button{font:inherit;font-size:.82rem;padding:.28rem .8rem;border:1px solid var(--line);border-radius:7px;background:var(--panel);color:var(--fg);cursor:pointer}
.controls button:hover{border-color:var(--accent);color:var(--accent)}
.stamp{color:var(--faint);font-size:.78rem;margin:0 0 0 auto}

nav.toc{grid-area:nav;padding:1.2rem 1rem;border-right:1px solid var(--line);position:sticky;top:3.7rem;align-self:start;max-height:calc(100vh - 3.7rem);overflow:auto}
nav.toc h2{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--faint);margin:0 0 .5rem .3rem}
nav.toc ul{list-style:none;margin:0;padding:0}
nav.toc .toc-section{font-weight:600;font-size:.82rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-top:1.1rem;margin-bottom:.15rem}
nav.toc .toc-section ul{font-weight:400;text-transform:none;letter-spacing:0}
nav.toc a{color:var(--muted);text-decoration:none;display:block;padding:.18rem .5rem;font-size:.9rem;border-radius:6px;border-left:2px solid transparent}
nav.toc a:hover{color:var(--fg);background:var(--panel);border-left-color:var(--accent)}

main{grid-area:main;padding:2rem 2.5rem 6rem;max-width:56rem}
h2.part{font-family:var(--serif);font-size:1rem;font-weight:600;text-transform:uppercase;letter-spacing:.12em;color:var(--accent);
  margin:3rem 0 0;padding-bottom:.4rem;border-bottom:1px solid var(--line)}
h2.part:first-child{margin-top:0}

.chapter{margin:2.4rem 0 0;scroll-margin-top:5rem}
.chapter-head{margin-bottom:1rem}
.eyebrow{font-size:.72rem;text-transform:uppercase;letter-spacing:.12em;color:var(--faint);margin:0 0 .1rem;font-weight:600}
.chapter-title{font-family:var(--serif);font-size:1.9rem;font-weight:600;line-height:1.15;margin:0}
.chapter-intro{color:var(--muted);font-size:1.02rem;margin:.6rem 0 0;max-width:44rem}

/* A scenario: a titled task, default open, that reads as an illustrated walkthrough. */
.scenario{border-top:1px solid var(--line);margin-top:1.4rem;padding-top:1.1rem}
.scenario>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:.6rem}
.scenario>summary::-webkit-details-marker{display:none}
.dot{width:.5rem;height:.5rem;border-radius:50%;flex:none;background:var(--skip)}
[data-status=passed]>summary>.dot{background:var(--pass)}
[data-status=failed]>summary>.dot{background:var(--fail)}
.sc-title{font-size:1.12rem;font-weight:650;margin:0}
.sc-chips{display:flex;gap:.3rem;flex-wrap:wrap}
.chip{font-size:.72rem;padding:.06rem .55rem;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--muted);white-space:nowrap}
.sc-thumb{width:4.5rem;height:2.7rem;object-fit:cover;object-position:top left;border:1px solid var(--line);border-radius:5px;margin-left:auto;display:none}
.scenario:not([open])>summary .sc-thumb{display:block}
.chev{width:0;height:0;border-left:6px solid var(--faint);border-top:5px solid transparent;border-bottom:5px solid transparent;transition:transform .15s;flex:none}
.scenario:not([open])>summary .chev{margin-left:auto}
.scenario:not([open])>summary .sc-thumb+.chev{margin-left:.6rem}
.scenario[open]>summary .chev{transform:rotate(90deg);margin-left:auto}

.sc-desc{color:var(--muted);margin:.7rem 0 0}
.walk{list-style:none;margin:1rem 0 0;padding:0}
.step{padding:0 0 0 5rem;position:relative;margin:0 0 1.1rem}
.step:last-child{margin-bottom:.4rem}
.step-line{margin-left:-5rem;display:flex;gap:.6rem;align-items:baseline;min-height:1.6rem}
.kw-pill{flex:none;width:3.6rem;text-align:center;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
  padding:.12rem 0;border-radius:5px;color:#fff;background:var(--skip);transform:translateY(-.05rem)}
[data-kw=given] .kw-pill{background:var(--given)}
[data-kw=when] .kw-pill{background:var(--when)}
[data-kw=then] .kw-pill{background:var(--then)}
[data-kw=and] .kw-pill,[data-kw=but] .kw-pill{background:transparent;color:var(--faint);border:1px solid var(--line)}
.step-text{font-size:1rem}
.step-text code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.86em;background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:.02rem .32rem}

.figs{margin:.6rem 0 0;display:flex;flex-wrap:wrap;gap:.6rem}
.fig{margin:0;flex:1 1 20rem;max-width:100%}
.fig img{width:100%;display:block;border:1px solid var(--line);border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.figs.result{padding:.7rem;border:1px solid var(--line);border-left:3px solid var(--then);border-radius:8px;background:var(--panel);position:relative}
.figs.result .fig img{box-shadow:0 4px 14px rgba(0,0,0,.10)}
.result-tag{position:absolute;top:-.62rem;left:.7rem;font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
  color:var(--then);background:var(--bg);padding:0 .4rem;border-radius:4px}
.shot{cursor:zoom-in}
.docstring{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82rem;background:var(--panel);border:1px solid var(--line);
  border-radius:6px;padding:.6rem .7rem;margin:.5rem 0 0;white-space:pre-wrap;overflow:auto}
.err{background:color-mix(in srgb,var(--fail) 8%,var(--bg));border:1px solid color-mix(in srgb,var(--fail) 35%,var(--bg));color:var(--fail);
  padding:.55rem .7rem;border-radius:6px;white-space:pre-wrap;font-size:.82rem;overflow:auto;margin:.5rem 0 0}

.lb{position:fixed;inset:0;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:2rem;z-index:50;cursor:zoom-out}
.lb[hidden]{display:none}
.lb img{max-width:100%;max-height:100%;border-radius:6px;box-shadow:0 8px 48px rgba(0,0,0,.6)}

@media (max-width:820px){
  body{grid-template-columns:1fr;grid-template-areas:"head" "nav" "main"}
  nav.toc{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--line)}
  main{padding:1.4rem 1.2rem 4rem}
  .step{padding-left:0}
  .step-line{margin-left:0;flex-wrap:wrap}
}
@media print{
  nav.toc,.controls{display:none}
  body{display:block}
  header{position:static}
  .scenario{break-inside:avoid}
  .fig img{box-shadow:none}
}
`;

const JS = `
document.querySelector('.controls').addEventListener('click',function(e){
  var act=e.target.getAttribute('data-act'); if(!act) return;
  var open=act==='expand';
  document.querySelectorAll('main details.scenario').forEach(function(d){d.open=open});
});
// Clicking any screenshot zooms it in a lightbox. The collapsed-view thumbnail
// lives inside the scenario's <summary>, so cancel the default toggle there.
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
