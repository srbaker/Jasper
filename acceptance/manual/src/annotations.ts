/**
 * Map a chapter's tags to human-readable "runs against" notes for the manual, so
 * a reader sees exactly what each scenario needs — which extent, and (when it
 * connects) which user. Product-specific: the engine takes this as a function and
 * knows nothing about Jasper's tags.
 *
 * The guiding rule: connecting to a stone is always called out with its extent
 * AND its user, and SystemUser — used only where unavoidable — is named
 * explicitly because it runs with elevated privilege.
 */
export function annotate(tags: string[]): string[] {
  const has = (t: string) => tags.includes(t);
  const notes: string[] = [];

  if (has('@stone') || has('@stone:bare')) {
    notes.push(has('@stone:bare') ? 'Bare extent' : 'rowan3 extent');
    notes.push(has('@systemuser') ? 'Connects as SystemUser' : 'Connects as DataCurator');
  }
  if (has('@download')) notes.push('Downloads a GemStone release');
  if (has('@install') || has('@bare')) notes.push('Installed from the Marketplace (live)');
  if (has('@rowan-project')) notes.push('A Rowan project on disk · no stone');
  if (has('@no-workspace')) notes.push('No folder open');

  return notes;
}
