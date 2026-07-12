// Webview-side script for the GemStone Login Launcher (gemstoneLoginLauncher.ts).
// Renders the launch bar + login dropdown and posts connect/disconnect/select
// back to the host. Exposes a single global so it can be unit-tested in jsdom.
(function () {
  let vscode;
  let root;
  let menuOpen = false;
  let state = { groups: [], hasLogins: false };

  const ICONS = {
    play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5-9-5.5z"/></svg>',
    stop: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 3.5h9v9h-9z"/></svg>',
    caret: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4z"/></svg>',
    key: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10 2a4 4 0 0 0-3.9 5L2 11.1V14h2.9l.7-.7V12h1.3l.7-.7V10h1.3l1.2-1.2A4 4 0 1 0 10 2zm1.5 3.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>',
    gear: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5zm0 4A1.5 1.5 0 1 1 8 6.5a1.5 1.5 0 0 1 0 3zM14 8l-1.3-.5c-.1-.4-.2-.7-.4-1l.6-1.3-1.1-1.1-1.3.6c-.3-.2-.6-.3-1-.4L9 3H7l-.5 1.3c-.4.1-.7.2-1 .4l-1.3-.6-1.1 1.1.6 1.3c-.2.3-.3.6-.4 1L2 8v2l1.3.5c.1.4.2.7.4 1l-.6 1.3 1.1 1.1 1.3-.6c.3.2.6.3 1 .4L7 15h2l.5-1.3c.4-.1.7-.2 1-.4l1.3.6 1.1-1.1-.6-1.3c.2-.3.3-.6.4-1L14 10V8z"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 2h1v5.5H14v1H8.5V14h-1V8.5H2v-1h5.5V2z"/></svg>',
    bolt: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M9.3 1L3 9h4l-1 6 6.5-8.5H8L9.3 1z"/></svg>',
    plug: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 1v4H4v2a4 4 0 0 0 3 3.9V15h2v-4.1A4 4 0 0 0 12 7V5h-1V1H9v4H7V1H5z"/></svg>',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  }

  function post(msg) {
    vscode.postMessage(msg);
  }

  function menuHtml() {
    const groups = state.groups
      .map((g) => {
        const items = g.logins
          .map((l) => {
            const sel = l.id === state.selectedId ? ' sel' : '';
            const recent = l.id === state.mruId ? '<span class="mi-recent">recent</span>' : '';
            return `<div class="menu-item${sel}" data-act="select" data-id="${esc(l.id)}">
              <span class="mi-dot${l.connected ? ' on' : ''}"></span>
              <span class="mi-label">${esc(l.who)} ${esc(l.where)} (${esc(l.host)})</span>${recent}
            </div>`;
          })
          .join('');
        return `<div class="menu-group">${esc(g.db)}</div>${items}`;
      })
      .join('');
    return `<div class="menu"${menuOpen ? '' : ' hidden'}>
      ${groups}
      <div class="menu-item add menu-sep" data-act="addLogin">${ICONS.plus}<span class="mi-label">New Login…</span></div>
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
    if (!state.hasLogins) {
      root.innerHTML = firstRunHtml();
      return;
    }
    const sel = state.selected;
    const connected = !!(sel && sel.connected);
    const label = sel
      ? `<span class="who">${esc(sel.who)}</span> <span class="where">${esc(sel.where)}</span>`
      : '<span class="where">Select a login…</span>';
    const power = connected
      ? `<button class="iconbtn stop" data-act="disconnect" data-id="${esc(sel.id)}" title="Log out">${ICONS.stop}</button>`
      : `<button class="iconbtn play" data-act="connect" data-id="${esc(sel ? sel.id : '')}" title="Log in">${ICONS.play}</button>`;
    const status = connected
      ? `<span class="dot on"></span>Connected — ${esc(sel.who)} ${esc(sel.where)}`
      : `<span class="dot"></span>Not connected · press ▶ to log in`;

    root.innerHTML = `
      <div class="launch-row">
        <div class="select" data-act="toggleMenu">
          <span class="lead${connected ? ' on' : ''}">${ICONS.key}</span>
          <span class="label">${label}</span>
          <span class="caret">${ICONS.caret}</span>
        </div>
        ${power}
        <button class="iconbtn" data-act="addLogin" title="Add login">${ICONS.plus}</button>
      </div>
      <div class="status">${status}</div>
      ${menuHtml()}`;
  }

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) {
      if (menuOpen) {
        menuOpen = false;
        render();
      }
      return;
    }
    const act = el.dataset.act;
    const id = el.dataset.id;
    if (act === 'toggleMenu') {
      menuOpen = !menuOpen;
      render();
      return;
    }
    if (act === 'select') {
      menuOpen = false;
      post({ command: 'select', id });
      return;
    }
    if (act === 'connect' && id) {
      post({ command: 'connect', id });
      return;
    }
    if (act === 'disconnect' && id) {
      post({ command: 'disconnect', id });
      return;
    }
    if (act === 'addLogin') {
      menuOpen = false;
      post({ command: 'addLogin' });
      return;
    }
    if (act === 'magicStart' || act === 'setupOptions' || act === 'connectExisting') {
      post({ command: act });
      return;
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
        // A fresh render implicitly closes the menu unless the update was a
        // pure selection change from an open menu; simplest is to close it.
        menuOpen = false;
        render();
      }
    });
  }

  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  g.GemstoneLoginLauncher = { init, render, menuHtml };
})();
