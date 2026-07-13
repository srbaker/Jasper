import { QueryExecutor } from '../types';

// Names of every loaded WebApp subclass — the web apps WebGS can serve. Empty
// when WebGS isn't loaded (no WebApp global). `allSubclasses` so a subclass of a
// subclass is found too.
export function listWebApps(execute: QueryExecutor): string[] {
  const code = `| wa ws |
wa := System myUserProfile symbolList objectNamed: #'WebApp'.
wa isNil ifTrue: [^''].
ws := WriteStream on: String new.
(wa allSubclasses asSortedCollection: [:a :b | a name <= b name])
  do: [:c | ws nextPutAll: c name asString; lf].
ws contents`;
  const raw = execute('listWebApps', code);
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}
