// Webview-side script for the GemStone Login Launcher (gemstoneLoginLauncher.ts).
// Renders the launch bar + login dropdown and posts connect/disconnect/select
// back to the host. Exposes a single global so it can be unit-tested in jsdom.
(function () {
  let vscode;
  let root;
  let state = { hasAny: false, activeSessions: [], databases: [], otherLogins: [], recent: [] };

  const ICONS = {
    play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5-9-5.5z"/></svg>',
    stop: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 3.5h9v9h-9z"/></svg>',
    caret: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4z"/></svg>',
    key: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10 2a4 4 0 0 0-3.9 5L2 11.1V14h2.9l.7-.7V12h1.3l.7-.7V10h1.3l1.2-1.2A4 4 0 1 0 10 2zm1.5 3.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>',
    gear: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5zm0 4A1.5 1.5 0 1 1 8 6.5a1.5 1.5 0 0 1 0 3zM14 8l-1.3-.5c-.1-.4-.2-.7-.4-1l.6-1.3-1.1-1.1-1.3.6c-.3-.2-.6-.3-1-.4L9 3H7l-.5 1.3c-.4.1-.7.2-1 .4l-1.3-.6-1.1 1.1.6 1.3c-.2.3-.3.6-.4 1L2 8v2l1.3.5c.1.4.2.7.4 1l-.6 1.3 1.1 1.1 1.3-.6c.3.2.6.3 1 .4L7 15h2l.5-1.3c.4-.1.7-.2 1-.4l1.3.6 1.1-1.1-.6-1.3c.2-.3.3-.6.4-1L14 10V8z"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 2h1v5.5H14v1H8.5V14h-1V8.5H2v-1h5.5V2z"/></svg>',
    bolt: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M9.3 1L3 9h4l-1 6 6.5-8.5H8L9.3 1z"/></svg>',
    plug: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 1v4H4v2a4 4 0 0 0 3 3.9V15h2v-4.1A4 4 0 0 0 12 7V5h-1V1H9v4H7V1H5z"/></svg>',
    recent: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a6 6 0 1 0 5.7 4.1l-1 .3A5 5 0 1 1 8 3v2l3-2.5L8 0v2zM7.5 4.5v4l3.3 2 .5-.9L8.5 8V4.5h-1z"/></svg>',
    commit: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.4 11.6L2.8 8l1.1-1.1 2.5 2.5 5.7-5.7L13.2 4.8z"/></svg>',
    abort: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 3V1L4.5 4 8 7V5a4 4 0 1 1-4 4H2.5A5.5 5.5 0 1 0 8 3z"/></svg>',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  }

  function post(msg) {
    vscode.postMessage(msg);
  }

  function activeHtml(s) {
    return `<div class="row active">
      <span class="rdot on"></span>
      <span class="rlabel"><span class="who">${esc(s.who)}</span> <span class="where">${esc(s.where)} (${esc(s.host)})</span></span>
      <button class="iconbtn" data-act="commit" data-id="${esc(s.id)}" title="Commit">${ICONS.commit}</button>
      <button class="iconbtn" data-act="abort" data-id="${esc(s.id)}" title="Abort">${ICONS.abort}</button>
      <button class="iconbtn stop" data-act="disconnect" data-id="${esc(s.id)}" title="Log out">${ICONS.stop}</button>
    </div>`;
  }

  function loginRowHtml(l) {
    return `<div class="row login">
      <span class="rdot"></span>
      <span class="rlabel"><span class="who">${esc(l.who)}</span> <span class="where">(${esc(l.host)})</span></span>
      <button class="iconbtn play" data-act="connect" data-id="${esc(l.id)}" title="Log in">${ICONS.play}</button>
    </div>`;
  }

  function dbHtml(db) {
    const badge = db.running
      ? '<span class="badge on">running</span>'
      : '<span class="badge">stopped</span>';
    const body = db.logins.length
      ? db.logins.map(loginRowHtml).join('')
      : `<div class="row nologin">
          <span class="rlabel muted">No login yet</span>
          <button class="iconbtn play" data-act="addLoginToDb" data-stone="${esc(db.stoneName)}" title="Add a login and connect">${ICONS.plus}</button>
        </div>`;
    return `<div class="db">
      <div class="db-head"><span class="db-name">${esc(db.stoneName)}</span><span class="db-ver">${esc(db.version)}</span>${badge}</div>
      ${body}
    </div>`;
  }

  function recentRowHtml(r) {
    return `<div class="row recent">
      <span class="ricon">${ICONS.recent}</span>
      <span class="rlabel"><span class="who">${esc(r.who)}</span> <span class="where">${esc(r.where)}</span> <span class="ago">· ${esc(r.ago)}</span></span>
      <button class="iconbtn play" data-act="reconnect" data-key="${esc(r.key)}" title="Reconnect">${ICONS.play}</button>
    </div>`;
  }

  function footerHtml() {
    return `<div class="footer">
      <button class="linkact" data-act="addLogin">${ICONS.plus}<span>Add login</span></button>
      <button class="linkact" data-act="setupOptions">${ICONS.bolt}<span>New database</span></button>
      <button class="linkact" data-act="connectExisting">${ICONS.plug}<span>Existing stone</span></button>
    </div>`;
  }

  function firstRunHtml() {
    return `
      <div class="firstrun">
        <p class="fr-lead">No GemStone sessions yet — get started:</p>
        <button class="fr-card primary" data-act="magicStart">
          <span class="fr-icon">${ICONS.bolt}</span>
          <span class="fr-text">
            <span class="fr-title">Get started</span>
            <span class="fr-sub">Latest GemStone, a fresh database, connected and ready. Nothing to pick.</span>
          </span>
        </button>
        <button class="fr-card" data-act="setupOptions">
          <span class="fr-icon">${ICONS.gear}</span>
          <span class="fr-text">
            <span class="fr-title">Set up with options…</span>
            <span class="fr-sub">Choose the version and database settings.</span>
          </span>
        </button>
        <button class="fr-card" data-act="connectExisting">
          <span class="fr-icon">${ICONS.plug}</span>
          <span class="fr-text">
            <span class="fr-title">Connect to an existing stone…</span>
            <span class="fr-sub">Already running a stone? Point Jasper at it.</span>
          </span>
        </button>
      </div>`;
  }

  function render() {
    if (!state.hasAny) {
      root.innerHTML = firstRunHtml();
      return;
    }
    let html = '';
    if (state.activeSessions.length) {
      html += `<div class="sec">${state.activeSessions.map(activeHtml).join('')}</div>`;
    }
    if (state.databases.length) {
      if (state.activeSessions.length) html += `<div class="sec-label">Databases</div>`;
      html += state.databases.map(dbHtml).join('');
    }
    if (state.otherLogins.length) {
      html += `<div class="sec-label">Other logins</div>${state.otherLogins.map(loginRowHtml).join('')}`;
    }
    if (state.recent && state.recent.length) {
      html += `<div class="sec-label">Recent</div>${state.recent.map(recentRowHtml).join('')}`;
    }
    html += footerHtml();
    root.innerHTML = html;
  }

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const id = el.dataset.id;
    if (act === 'connect' && id) return void post({ command: 'connect', id });
    if (act === 'disconnect' && id) return void post({ command: 'disconnect', id });
    if (act === 'commit' && id) return void post({ command: 'commit', id });
    if (act === 'abort' && id) return void post({ command: 'abort', id });
    if (act === 'reconnect') return void post({ command: 'reconnect', key: el.dataset.key });
    if (act === 'addLogin') return void post({ command: 'addLogin' });
    if (act === 'addLoginToDb') return void post({ command: 'addLoginToDb', stone: el.dataset.stone });
    if (act === 'magicStart' || act === 'setupOptions' || act === 'connectExisting') {
      return void post({ command: act });
    }
  }

  function init(rootEl, api) {
    root = rootEl;
    vscode = api;
    document.addEventListener('click', onClick);
    root.innerHTML = '<div class="empty">Loading…</div>';
    window.addEventListener('message', (ev) => {
      const msg = ev.data;
      if (msg && msg.command === 'state') {
        state = msg.state;
        render();
      }
    });
  }

  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  g.GemstoneLoginLauncher = { init, render };
})();
