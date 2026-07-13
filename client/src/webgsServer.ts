import { ActiveSession } from './sessionManager';
import { loginAsWorkingUser } from './systemUserSession';
import { OOP_NIL, OOP_ILLEGAL } from './gciConstants';

// WebGS's HttpListener defaults to this port (`<App> runHttp`).
export const WEBGS_PORT = 8888;

export interface ServingApp {
  /** The WebApp subclass name being served. */
  appName: string;
  port: number;
  /** Base URL of the running server. */
  url: string;
}

// Runs WebGS servers. Each running app owns a DEDICATED same-user GemStone
// session whose Gem sits in `<App> runHttp`'s accept loop. The IDE's own login
// session can't serve — its Gem is parked between GCI calls — so serving needs a
// Gem of its own. We start the (blocking) accept loop with a non-blocking execute
// and never poll its result: the Gem then serves autonomously until we hard-break
// and log it out.
//
// Because the serving Gem shares the stone's single image, an endpoint method the
// IDE session edits and commits is picked up by the server on its next
// transaction — no restart. That is the point of WebGS-on-GemStone, and it is what
// makes the "edit → reload → see the change" loop real rather than a hot-reload
// trick. Never runs as SystemUser (see [[feedback-no-systemuser-in-rowan]]): the
// same-user session sees the app in the working user's dictionaries.
export class WebGsServer {
  private serving = new Map<string, { app: ServingApp; session: ActiveSession }>();

  isRunning(appName: string): boolean {
    return this.serving.has(appName);
  }

  runningApps(): ServingApp[] {
    return [...this.serving.values()].map((s) => s.app);
  }

  urlFor(appName: string): string | undefined {
    return this.serving.get(appName)?.app.url;
  }

  // Start `<appName> runHttp` on a dedicated same-user serving Gem. Idempotent:
  // an already-running app returns its existing descriptor. Throws if the serving
  // session can't be opened or the VM rejects the start.
  start(base: ActiveSession, appName: string): ServingApp {
    const existing = this.serving.get(appName);
    if (existing) return existing.app;

    const session = loginAsWorkingUser(base);
    if (!session) {
      throw new Error(
        'This session’s credentials aren’t available to open a serving session. Reconnect and try again.',
      );
    }

    // The source string's class (Utf8), so the VM interprets `code` correctly.
    const { result: oopUtf8 } = session.gci.GciTsResolveSymbol(session.handle, 'Utf8', OOP_NIL);
    // Fire the blocking accept loop, non-blocking to us; do not poll the result —
    // it never returns while serving. The Gem runs autonomously from here.
    const { err } = session.gci.GciTsNbExecute(
      session.handle, `${appName} runHttp`, oopUtf8, OOP_ILLEGAL, OOP_NIL, 0, 0,
    );
    if (err && err.number !== 0) {
      try { session.gci.GciTsLogout(session.handle); } catch { /* best effort */ }
      throw new Error(err.message || `Could not start ${appName} (GCI error ${err.number}).`);
    }

    const app: ServingApp = { appName, port: WEBGS_PORT, url: `http://localhost:${WEBGS_PORT}/` };
    this.serving.set(appName, { app, session });
    return app;
  }

  // Stop a running app: hard-break its accept loop, then log the serving Gem out
  // (which closes the listening socket). Best-effort — a dead session is fine.
  stop(appName: string): void {
    const entry = this.serving.get(appName);
    if (!entry) return;
    try { entry.session.gci.GciTsBreak(entry.session.handle, true); } catch { /* best effort */ }
    try { entry.session.gci.GciTsLogout(entry.session.handle); } catch { /* best effort */ }
    this.serving.delete(appName);
  }

  stopAll(): void {
    for (const name of [...this.serving.keys()]) this.stop(name);
  }
}
