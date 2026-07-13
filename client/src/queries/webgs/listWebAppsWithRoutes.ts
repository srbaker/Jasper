import { QueryExecutor } from '../types';

export interface WebAppInfo {
  /** The WebApp subclass name. */
  name: string;
  /** Endpoint paths, e.g. "/counter.gs" (from `counter_gs:` methods). */
  routes: string[];
}

// Every loaded WebApp subclass with its endpoint routes. A WebGS endpoint is an
// instance method named `<path>_gs:` — `counter_gs:` answers `/counter.gs` — so
// the routes are just those selectors, transformed. Empty when WebGS isn't loaded.
// One line per app: `Name<tab>/route1<tab>/route2…`.
export function listWebAppsWithRoutes(execute: QueryExecutor): WebAppInfo[] {
  const code = `| wa ws |
wa := System myUserProfile symbolList objectNamed: #'WebApp'.
wa isNil ifTrue: [^''].
ws := WriteStream on: String new.
(wa allSubclasses asSortedCollection: [:a :b | a name <= b name]) do: [:c |
  ws nextPutAll: c name asString.
  ((c selectors collect: [:s | s asString]) asSortedCollection) do: [:s |
    (s endsWith: '_gs:') ifTrue: [
      ws tab; nextPut: $/; nextPutAll: (s copyFrom: 1 to: s size - 4); nextPutAll: '.gs']].
  ws lf].
ws contents`;
  const raw = execute('listWebAppsWithRoutes', code);
  const apps: WebAppInfo[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const name = parts[0]?.trim();
    if (!name) continue;
    apps.push({ name, routes: parts.slice(1).map((r) => r.trim()).filter(Boolean) });
  }
  return apps;
}
