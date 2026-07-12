import { describe, it, expect } from 'vitest';
import { recordRecentSession, getRecentSessions, recentKey, timeAgo } from '../recentSessions';
import { GemStoneLogin } from '../loginTypes';

/** A minimal in-memory Memento for the recent-session store. */
function memento(): any {
  const map = new Map<string, unknown>();
  return {
    get: (key: string, fallback?: unknown) => (map.has(key) ? map.get(key) : fallback),
    update: async (key: string, value: unknown) => void map.set(key, value),
  };
}

function login(overrides?: Partial<GemStoneLogin>): GemStoneLogin {
  return {
    label: '', version: '3.7.5', gem_host: 'localhost', stone: 'gs64stone',
    netldi: 'gs64ldi', gs_user: 'DataCurator', gs_password: '', host_user: '', host_password: '',
    ...overrides,
  } as GemStoneLogin;
}

describe('recentSessions', () => {
  it('records a connection at the top of the list', async () => {
    const g = memento();

    await recordRecentSession(g, login({ stone: 'alpha' }), 1000);
    await recordRecentSession(g, login({ stone: 'beta' }), 2000);

    expect(getRecentSessions(g).map((r) => r.stone)).toEqual(['beta', 'alpha']);
  });

  it('never stores the password', async () => {
    const g = memento();

    await recordRecentSession(g, login({ gs_password: 'swordfish' }), 1000);

    expect(getRecentSessions(g)[0]).not.toHaveProperty('gs_password');
  });

  it('de-duplicates a repeated target and moves it to the top', async () => {
    const g = memento();

    await recordRecentSession(g, login({ stone: 'alpha' }), 1000);
    await recordRecentSession(g, login({ stone: 'beta' }), 2000);
    await recordRecentSession(g, login({ stone: 'alpha' }), 3000);

    const stones = getRecentSessions(g).map((r) => r.stone);
    expect(stones).toEqual(['alpha', 'beta']);
  });

  it('caps the list at eight', async () => {
    const g = memento();

    for (let i = 0; i < 12; i++) await recordRecentSession(g, login({ stone: `s${i}` }), i);

    expect(getRecentSessions(g)).toHaveLength(8);
  });

  it('keys a target by host, stone, netldi, user, and version', () => {
    const a = recentKey(login({ stone: 'gs64stone' }));
    const b = recentKey(login({ stone: 'other' }));

    expect(a).not.toEqual(b);
    expect(recentKey(login())).toEqual(recentKey(login()));
  });

  it('formats how long ago a connection was', () => {
    const now = 10_000_000;

    expect(timeAgo(now, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m ago');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe('2d ago');
  });
});
