import { QueryExecutor } from '../types';
import { escapeString } from '../util';

export interface RowanUnloadResult {
  success: boolean;
  // On success, the unloaded project's name; on failure, the error message
  // (e.g. "Cannot unload projects that are required by other projects…").
  detail: string;
}

// Unload a project from the image, then commit. Aborts on any failure so
// nothing partial is committed — notably, unloading a project other loaded
// projects depend on (a base project like Cypress) raises, and that message is
// surfaced. Run as the working USER (never SystemUser): the project is
// registered in the working user's dictionaries, so it's the working user's to
// unload — and only that user's session can then see it gone.
export function unloadRowanProject(execute: QueryExecutor, projectName: string): RowanUnloadResult {
  const esc = escapeString(projectName);
  const code = `| r sep |
sep := String with: Character tab.
r := System myUserProfile symbolList objectNamed: #'Rowan'.
r isNil ifTrue: [^'ERR' , sep , 'Rowan is not installed in this image'].
[r gemstoneTools topaz unloadProjectNamed: '${esc}'.
 System commitTransaction]
  on: Error do: [:e | System abortTransaction. ^'ERR' , sep , e messageText].
'OK' , sep , '${esc}'`;

  const raw = execute(`unloadRowanProject(${projectName})`, code);
  const tab = raw.indexOf('\t');
  const status = tab === -1 ? raw.trim() : raw.slice(0, tab);
  const detail = tab === -1 ? '' : raw.slice(tab + 1).trim();
  return { success: status === 'OK', detail };
}
