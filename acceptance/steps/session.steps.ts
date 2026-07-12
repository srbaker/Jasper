/**
 * Shared session preconditions. The canonical "logged in" Given embeds the login
 * flow (flows.logIn — the same flow the Connecting chapter demonstrates), so any
 * stone-backed chapter can depend on a live session without reimplementing login.
 */
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';
import { logIn } from './flows';

const { Given } = createBdd(test);

Given('I am logged in to the test stone', async ({ window, screen }) => {
  await logIn(window, screen);
});
