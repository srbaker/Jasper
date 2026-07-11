// Webview-side script for the GemStone Manager panel (gemstoneManager.ts).
// Plain JS that runs in the webview DOM (not bundled). Renders the state posted
// by the host and dispatches every action back to the host as a postMessage.
// Exposes a single global `GemstoneManager` so it can be unit-tested in jsdom.
//
// Convention (see debuggerView.js): host injects this, then calls
// GemstoneManager.init(refs, vscode) from a nonce'd bootstrap <script>.
(function () {
  let vscode;
  let els;
  // dirNames of databases the user has expanded — preserved across re-renders.
  const expandedDbs = new Set();

  // Inline codicon-style SVGs (fill=currentColor keeps them theme-driven).
  const ICONS = {
    memory:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v2H2V3zm0 3h12v7H2V6zm2 1v5h1V7H4zm3 0v5h1V7H7zm3 0v5h1V7h-1z"/></svg>',
    versions:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h9v1H2V3zm0 3h9v1H2V6zm0 3h9v1H2V9zm11-5.5 2 2.5-2 2.5-.8-.6L14 5H2v-1h12l-1.8-1.9.8-.6z"/></svg>',
    database:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1c-3.3 0-6 .9-6 2v10c0 1.1 2.7 2 6 2s6-.9 6-2V3c0-1.1-2.7-2-6-2zm0 1c2.9 0 5 .8 5 1s-2.1 1-5 1-5-.8-5-1 2.1-1 5-1zm5 3.4V7c0 .2-2.1 1-5 1s-5-.8-5-1V5.4c1.1.5 3 .9 5 .9s3.9-.4 5-.9zm0 3V10c0 .2-2.1 1-5 1s-5-.8-5-1V8.4c1.1.5 3 .9 5 .9s3.9-.4 5-.9zm-5 5.6c-2.9 0-5-.8-5-1v-1.6c1.1.5 3 .9 5 .9s3.9-.4 5-.9V13c0 .2-2.1 1-5 1z"/></svg>',
    download:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 1v7.3L4.7 5.5 4 6.2 8 10.2l4-4-.7-.7-2.8 2.8V1h-1zM3 13h10v1H3v-1z"/></svg>',
    install:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1 2 4v8l6 3 6-3V4L8 1zm0 1.1 4.6 2.3L8 6.7 3.4 4.4 8 2.1zM3 5.3l4.5 2.2v6.1L3 11.4V5.3zm10 0v6.1l-4.5 2.2V7.5L13 5.3z"/></svg>',
    folder:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2h4l1.5 1.5H14.5c.3 0 .5.2.5.5v9c0 .3-.2.5-.5.5h-13c-.3 0-.5-.2-.5-.5V2.5c0-.3.2-.5.5-.5z"/></svg>',
    trash:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10 3V2H6v1H3v1h1v9c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V4h1V3h-3zM6 12H5V5h1v7zm2 0H7V5h1v7zm2 0H9V5h1v7z"/></svg>',
    play:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5-9-5.5z"/></svg>',
    stop:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 3.5h9v9h-9z"/></svg>',
    terminal:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2h13c.3 0 .5.2.5.5v11c0 .3-.2.5-.5.5h-13c-.3 0-.5-.2-.5-.5v-11c0-.3.2-.5.5-.5zm.5 1v10h12V3H2zm1.7 2 .7-.7 2.3 2.3-2.3 2.3-.7-.7L5.6 6.6 4.2 5zM8 9h4v1H8V9z"/></svg>',
    reveal:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.7 5.1 1 8c.7 2.9 3.5 5 7 5s6.3-2.1 7-5c-.7-2.9-3.5-5-7-5zm0 8.3A3.3 3.3 0 1 1 8 4.7a3.3 3.3 0 0 1 0 6.6zm0-5.3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>',
    login:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M7 1v1H3v12h4v1H2V1h5zm2.3 3.3 3.5 3.5-3.5 3.5-.7-.7L10.6 8H6V7h4.6L8.6 5l.7-.7z"/></svg>',
    swap:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M11 2l3 3-3 3-.7-.7L12.6 5.5H4v-1h8.6L10.3 2.7 11 2zM5 8l.7.7L3.4 11H12v1H3.4l2.3 2.3L5 15l-3-3 3-3z"/></svg>',
    plus:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 2h1v5.5H14v1H8.5V14h-1V8.5H2v-1h5.5V2z"/></svg>',
    warn:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5 15 14H1L8 1.5zm0 2.4L2.7 13h10.6L8 3.9zM7.5 6h1v4h-1V6zm0 5h1v1h-1v-1z"/></svg>',
    gear:
      '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5zm0 4A1.5 1.5 0 1 1 8 6.5a1.5 1.5 0 0 1 0 3zM14 8l-1.3-.5c-.1-.4-.2-.7-.4-1l.6-1.3-1.1-1.1-1.3.6c-.3-.2-.6-.3-1-.4L9 3H7l-.5 1.3c-.4.1-.7.2-1 .4l-1.3-.6-1.1 1.1.6 1.3c-.2.3-.3.6-.4 1L2 8v2l1.3.5c.1.4.2.7.4 1l-.6 1.3 1.1 1.1 1.3-.6c.3.2.6.3 1 .4L7 15h2l.5-1.3c.4-.1.7-.2 1-.4l1.3.6 1.1-1.1-.6-1.3c.2-.3.3-.6.4-1L14 10V8z"/></svg>',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  }

  function formatBytes(n) {
    if (!n || n <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v >= 10 || i === 0 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`;
  }

  function btn(action, label, icon, cls, attrs) {
    const a = attrs || {};
    const dataVersion = a.version ? ` data-version="${esc(a.version)}"` : '';
    const dataDir = a.dir ? ` data-dir="${esc(a.dir)}"` : '';
    const dataFolder = a.folder ? ` data-folder="${esc(a.folder)}"` : '';
    const title = a.title ? ` title="${esc(a.title)}"` : '';
    const iconOnly = a.iconOnly ? '' : `<span>${esc(label)}</span>`;
    const ariaLabel = a.iconOnly ? ` aria-label="${esc(label)}"` : '';
    return `<button class="btn ${cls || 'btn-secondary'} btn-sm" data-action="${action}"${dataVersion}${dataDir}${dataFolder}${title}${ariaLabel}>${icon ? ICONS[icon] : ''}${iconOnly}</button>`;
  }

  // ── OS section ──────────────────────────────────────────────────────────────
  // An OS "warning" is anything the user may need to fix: shared memory below
  // the 1 GB threshold, or state that couldn't be read at all.
  function osHasWarning(os) {
    return !!os.supported && (os.unknown || !os.sharedMemoryConfigured);
  }

  function openAttr(open) {
    return open ? ' open' : '';
  }

  function renderOs(os, open) {
    if (!os.supported) {
      return `<details class="section"${openAttr(open)}>
        <summary><span class="section-icon">${ICONS.memory}</span><span class="section-title">Operating System</span></summary>
        <div class="section-body"><div class="note">${ICONS.warn}<span>OS prerequisites are not surfaced on this platform.</span></div></div>
      </details>`;
    }
    const smConfigured = os.sharedMemoryConfigured;
    const smClass = os.unknown ? 'off' : smConfigured ? 'ok' : 'warn';
    const smText = os.unknown
      ? 'Shared memory: unknown'
      : smConfigured
        ? `Shared memory configured (${esc(os.gbLabel)} GB)`
        : `Shared memory not configured (< 1 GB)`;
    const detail = os.unknown
      ? `<div class="note">${ICONS.warn}<span>Could not read shared memory — WSL may be unavailable, or run Quick Setup to configure it.</span></div>`
      : `<div class="os-detail">
           <div><span>shmmax</span><span>${esc(formatBytes(os.shmmaxBytes))}</span></div>
           <div><span>shmall</span><span>${os.shmallBytes ? esc(formatBytes(os.shmallBytes * 4096)) : '—'}</span></div>
         </div>`;
    const warnMark = osHasWarning(os) ? `<span class="head-warn" title="Needs attention">${ICONS.warn}</span>` : '';
    return `<details class="section"${openAttr(open)}>
      <summary>
        <span class="section-icon">${ICONS.memory}</span>
        <span class="section-title">Operating System</span>${warnMark}
        <span class="count-badge">${esc(os.platformLabel)}</span>
        <span class="section-head-actions">
          ${btn('quickSetup', 'Run Quick Setup', 'gear', 'btn-secondary')}
        </span>
      </summary>
      <div class="section-body">
        <div class="os-grid">
          <div class="os-card">
            <div class="os-card-label">Platform</div>
            <div class="os-status"><span class="dot ok"></span>${esc(os.platformLabel)}</div>
          </div>
          <div class="os-card">
            <div class="os-card-label">Shared Memory</div>
            <div class="os-status"><span class="dot ${smClass}"></span>${smText}</div>
            ${detail}
          </div>
        </div>
      </div>
    </details>`;
  }

  // ── Versions section ────────────────────────────────────────────────────────
  function versionState(v) {
    if (v.local) return 'local';
    if (v.extracted) return 'installed';
    if (v.downloaded) return 'downloaded';
    return 'available';
  }

  function versionActions(v) {
    const state = versionState(v);
    if (state === 'local') {
      return (
        btn('openVersionFolder', 'Open Folder', 'folder', 'btn-ghost', { version: v.version, iconOnly: true, title: 'Open product folder' }) +
        btn('unregisterLocalVersion', 'Unregister', null, 'btn-danger', { version: v.version, title: 'Remove the local symlink' })
      );
    }
    if (state === 'installed') {
      return (
        btn('openVersionFolder', 'Open Folder', 'folder', 'btn-ghost', { version: v.version, iconOnly: true, title: 'Open product folder' }) +
        btn('uninstallVersion', 'Uninstall', 'trash', 'btn-danger', { version: v.version, title: 'Remove the extracted product' })
      );
    }
    if (state === 'downloaded') {
      return (
        btn('extractVersion', 'Install', 'install', 'btn-primary', { version: v.version, title: 'Extract this version' }) +
        btn('deleteDownload', 'Delete Download', 'trash', 'btn-danger', { version: v.version, iconOnly: true, title: 'Delete the downloaded archive' })
      );
    }
    return btn('downloadVersion', 'Download', 'download', 'btn-secondary', { version: v.version });
  }

  function pill(state) {
    const labels = { installed: 'Installed', downloaded: 'Downloaded', available: 'Available', local: 'Local' };
    return `<span class="pill pill-${state}">${labels[state]}</span>`;
  }

  function versionsInstalledCount(versions) {
    return versions.filter((v) => v.extracted || v.local).length;
  }

  function renderVersions(versions, open) {
    const rows = versions.length
      ? versions
          .map((v) => {
            const state = versionState(v);
            const sub = [];
            if (v.size) sub.push(formatBytes(v.size));
            if (v.date) sub.push(esc(v.date));
            if (v.bundled) sub.push('bundled GCI');
            return `<div class="row">
              <div class="row-main">
                <div class="row-title"><span class="row-name mono">${esc(v.version)}</span>${pill(state)}</div>
                ${sub.length ? `<div class="row-sub">${sub.map((s) => `<span>${s}</span>`).join('')}</div>` : ''}
              </div>
              <div class="row-actions">${versionActions(v)}</div>
            </div>`;
          })
          .join('')
      : `<div class="empty">No GemStone versions found. Download one or register a local build.</div>`;
    const installed = versionsInstalledCount(versions);
    return `<details class="section"${openAttr(open)}>
      <summary>
        <span class="section-icon">${ICONS.versions}</span>
        <span class="section-title">Versions</span>
        <span class="count-badge">${installed} installed</span>
        <span class="section-head-actions">${btn('registerLocalVersion', 'Register Local…', 'plus', 'btn-ghost')}</span>
      </summary>
      <div class="section-body">${rows}</div>
    </details>`;
  }

  // ── Databases section ───────────────────────────────────────────────────────
  function svc(label, running, on, off) {
    return `<span class="svc"><span class="dot ${running ? 'ok' : 'off'}"></span><span class="svc-label">${esc(label)}</span><span class="svc-state ${running ? 'on' : 'offc'}">${running ? 'Running' : 'Stopped'}</span></span>`;
  }

  // The combined running-status + whole-database power control. The status IS
  // the button: click to bring the Stone + NetLDI up or down together.
  function powerControl(db) {
    return db.stoneRunning
      ? `<button class="db-power on" data-action="stopDatabase" data-dir="${esc(db.dirName)}" title="Stop database (Stone + NetLDI)"><span class="dot ok"></span><span class="db-power-text">Running</span>${ICONS.stop}</button>`
      : `<button class="db-power off" data-action="startDatabase" data-dir="${esc(db.dirName)}" title="Start database (Stone + NetLDI)"><span class="dot off"></span><span class="db-power-text">Stopped</span>${ICONS.play}</button>`;
  }

  function subHead(title, action) {
    return `<div class="db-sub-head"><span>${esc(title)}</span>${action || ''}</div>`;
  }

  // Live processes for this database (empty when nothing is running).
  function renderProcesses(db) {
    if (!db.processes.length) {
      return `<div class="db-sub">${subHead('Processes')}<div class="db-empty">Not running.</div></div>`;
    }
    const rows = db.processes
      .map((p) => {
        const stale = !p.responding;
        const meta = [`pid ${p.pid}`];
        if (p.port) meta.push(`port ${p.port}`);
        meta.push(stale ? `stale · ${esc(p.status)}` : 'OK');
        return `<div class="db-line${stale ? ' row-warn' : ''}">
          <span class="db-line-name"><span class="dot ${stale ? 'warn' : 'ok'}"></span>${p.type === 'stone' ? 'Stone' : 'NetLDI'} <span class="mono dim">${esc(p.name)}</span></span>
          <span class="db-line-meta mono">${meta.join(' · ')}</span>
        </div>`;
      })
      .join('');
    return `<div class="db-sub">${subHead('Processes')}${rows}</div>`;
  }

  // Logins that target this database, plus a New Login affordance.
  function renderLogins(db) {
    const rows = db.logins.length
      ? db.logins
          .map(
            (l) =>
              `<div class="db-line"><span class="db-line-name">${ICONS.login}<span>${esc(l.label)}</span></span></div>`,
          )
          .join('')
      : `<div class="db-empty">No logins yet.</div>`;
    const add = btn('createLoginFromDb', 'New Login', 'plus', 'btn-ghost', { dir: db.dirName });
    return `<div class="db-sub">${subHead('Logins', add)}${rows}</div>`;
  }

  // The database's sections: Stone, NetLDI, and its Logs/Config folders.
  function svcRow(label, running, startAction, stopAction, dir, extra) {
    const chip = running
      ? `<span class="svc"><span class="dot ok"></span><span class="svc-state on">Running</span></span>`
      : `<span class="svc"><span class="dot off"></span><span class="svc-state offc">Stopped</span></span>`;
    const toggle = running
      ? btn(stopAction, 'Stop', 'stop', 'btn-ghost', { dir, iconOnly: true, title: `Stop ${label}` })
      : btn(startAction, 'Start', 'play', 'btn-ghost', { dir, iconOnly: true, title: `Start ${label}` });
    return `<div class="db-line">
      <span class="db-line-name">${esc(label)}${extra ? ` <span class="mono dim">${extra}</span>` : ''}</span>
      <span class="db-line-actions">${chip}${toggle}</span>
    </div>`;
  }

  function renderSectionsGroup(db) {
    const stone = svcRow('Stone', db.stoneRunning, 'startStone', 'stopStone', db.dirName, esc(db.stoneName));
    const netldi = svcRow('NetLDI', db.netldiRunning, 'startNetldi', 'stopNetldi', db.dirName, esc(db.ldiName));
    const logs = `<div class="db-line"><span class="db-line-name">Logs</span><span class="db-line-actions">${btn('openDbSubfolder', 'Open', 'folder', 'btn-ghost', { dir: db.dirName, folder: 'log' })}</span></div>`;
    const conf = `<div class="db-line"><span class="db-line-name">Config</span><span class="db-line-actions">${btn('openDbSubfolder', 'Open', 'gear', 'btn-ghost', { dir: db.dirName, folder: 'conf' })}</span></div>`;
    const extent = `<div class="db-line"><span class="db-line-name">Base extent</span><span class="db-line-meta mono">${esc(db.baseExtent)}</span></div>`;
    return `<div class="db-sub">${subHead('Sections')}${stone}${netldi}${logs}${conf}${extent}</div>`;
  }

  function renderDbItem(db) {
    return `<details class="db-item" data-db="${esc(db.dirName)}">
      <summary class="db-summary">
        <span class="db-title"><span class="row-name">${esc(db.stoneName)}</span><span class="mono dim">${esc(db.dirName)}</span></span>
        <span class="pill pill-available mono">${esc(db.version)}</span>
        <span class="db-summary-actions">${powerControl(db)}</span>
      </summary>
      <div class="db-body">
        ${renderProcesses(db)}
        ${renderLogins(db)}
        ${renderSectionsGroup(db)}
        <div class="db-footer">
          ${btn('openDbTerminal', 'Terminal', 'terminal', 'btn-ghost', { dir: db.dirName })}
          ${btn('openDbInFinder', 'Reveal', 'reveal', 'btn-ghost', { dir: db.dirName })}
          ${btn('replaceExtent', 'Replace Extent', 'swap', 'btn-ghost', { dir: db.dirName })}
          ${btn('deleteDatabase', 'Delete Database', 'trash', 'btn-danger', { dir: db.dirName })}
        </div>
      </div>
    </details>`;
  }

  function renderDatabases(databases, open) {
    const body = databases.length
      ? databases.map(renderDbItem).join('')
      : `<div class="empty">No databases yet.<div>${btn('createDatabase', 'New Database…', 'plus', 'btn-primary')}</div></div>`;
    return `<details class="section"${openAttr(open)}>
      <summary>
        <span class="section-icon">${ICONS.database}</span>
        <span class="section-title">Databases</span>
        <span class="count-badge">${databases.length}</span>
        <span class="section-head-actions">${btn('createDatabase', 'New Database…', 'plus', 'btn-primary')}</span>
      </summary>
      <div class="section-body">${body}</div>
    </details>`;
  }

  // Sections reorder by urgency. Lower weight sorts higher on the page.
  //   OS:        warning → top (-100, expanded);  ok → bottom (+100, collapsed)
  //   Versions:  none installed → above databases (-10);  installed → below (+10)
  //   Databases: the anchor (0)
  function orderedSections(state) {
    const osWarn = osHasWarning(state.os);
    const hasVersions = versionsInstalledCount(state.versions) > 0;
    const sections = [
      { weight: osWarn ? -100 : 100, html: renderOs(state.os, osWarn) },
      { weight: hasVersions ? 10 : -10, html: renderVersions(state.versions, true) },
      { weight: 0, html: renderDatabases(state.databases, true) },
    ];
    sections.sort((a, b) => a.weight - b.weight);
    return sections;
  }

  function render(state) {
    els.rootPath.textContent = state.rootPath || '';
    els.root.innerHTML = orderedSections(state)
      .map((s) => s.html)
      .join('');
    // Restore each database's expanded state across re-renders, and keep the
    // set in sync as the user opens/closes them.
    els.root.querySelectorAll('details[data-db]').forEach((d) => {
      if (expandedDbs.has(d.dataset.db)) d.open = true;
      d.addEventListener('toggle', () => {
        if (d.open) expandedDbs.add(d.dataset.db);
        else expandedDbs.delete(d.dataset.db);
      });
    });
  }

  function post(msg) {
    vscode.postMessage(msg);
  }

  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    // Prevent an action button inside a <summary> from also toggling it.
    e.preventDefault();
    post({ command: el.dataset.action, version: el.dataset.version, dirName: el.dataset.dir, folder: el.dataset.folder });
  }

  function init(refs, api) {
    els = refs;
    vscode = api;
    els.root.addEventListener('click', onClick);
    if (els.refreshAll) els.refreshAll.addEventListener('click', () => post({ command: 'refresh' }));
    els.root.innerHTML = '<div class="skeleton">Loading GemStone environment…</div>';
    window.addEventListener('message', (ev) => {
      const msg = ev.data;
      if (!msg) return;
      if (msg.command === 'loading') {
        els.root.setAttribute('aria-busy', 'true');
      } else if (msg.command === 'state') {
        els.root.setAttribute('aria-busy', 'false');
        render(msg.state);
      }
    });
  }

  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  root.GemstoneManager = {
    init,
    render,
    renderOs,
    renderVersions,
    renderDatabases,
    orderedSections,
    osHasWarning,
    versionState,
    formatBytes,
  };
})();
