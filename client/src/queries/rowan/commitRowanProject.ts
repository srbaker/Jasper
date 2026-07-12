import { QueryExecutor } from '../types';
import { escapeString } from '../util';

export interface RowanCommitResult {
  success: boolean;
  // On failure, the error message; on success, the project name written.
  detail: string;
}

// Write a loaded Rowan project's image state back to its OWN on-disk Tonel
// repository, in place, and clear its dirty flag so the project reads as in-sync
// afterward.
//
// This is the counterpart to exportRowanProject: that writes a standalone COPY
// to a chosen folder via `writeResolvedProject:` (no image side effects, dirty
// flag untouched), whereas this uses `writeProjectNamed:` — the in-place variant
// that updates the dirty flag. Run as the working USER (never SystemUser): the
// project is registered in the working user's dictionaries (that's where load put
// it), so its dirty flag is theirs to update. Commits the transaction on success,
// aborts on error so nothing partial is left in the image.
export function commitRowanProject(
  execute: QueryExecutor, projectName: string,
): RowanCommitResult {
  const code = `| r lp sep |
sep := String with: Character tab.
r := System myUserProfile symbolList objectNamed: #'Rowan'.
r isNil ifTrue: [^'ERR' , sep , 'Rowan is not installed in this image'].
lp := r image loadedProjectNamed: '${escapeString(projectName)}' ifAbsent: [nil].
lp isNil ifTrue: [^'ERR' , sep , 'Project ${escapeString(projectName)} is not loaded'].
[r projectTools write writeProjectNamed: '${escapeString(projectName)}'.
 System commitTransaction]
  on: Error do: [:e | System abortTransaction. ^'ERR' , sep , e messageText].
'OK' , sep , '${escapeString(projectName)}'`;

  const raw = execute(`commitRowanProject(${projectName})`, code);
  const tab = raw.indexOf('\t');
  const status = tab === -1 ? raw.trim() : raw.slice(0, tab);
  const detail = tab === -1 ? '' : raw.slice(tab + 1).trim();
  return { success: status === 'OK', detail };
}
