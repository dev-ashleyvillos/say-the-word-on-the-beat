// Umami events for saywordsonbeat.com (gameplayce.io #1348).
//
// Events use the payload-function form and name this site's Umami website
// explicitly, so they land on the right site even if another tracker is ever
// mounted next to it. Nothing is sent without
// analytics consent — the tracker is not even loaded then, and the
// before-send hook re-checks consent on every hit anyway.
import { trackingAllowed } from './consent.js';

export const SITE_WEBSITE_ID = '9411ff1f-a13e-4671-a1e5-9f949e712b9e';

export type PromoEvent = 'promo:shown' | 'promo:click' | 'promo:dismiss';

type Payload = Record<string, unknown>;
interface UmamiLike {
  track: (fn: (base: Payload) => Payload) => unknown;
}

export function buildEventPayload(base: Payload, name: PromoEvent, data: Record<string, string>): Payload {
  return { ...base, website: SITE_WEBSITE_ID, name, data };
}

/** How long an event waits for the tracker script before it is dropped. */
export const TRACKER_WAIT_MS = 10_000;
const TRACKER_POLL_MS = 250;

function send(name: PromoEvent, data: Record<string, string>): boolean {
  // Re-checked at SEND time, not just when the event was raised: a visitor who
  // switches analytics off while an event waits for the tracker stays off.
  if (!trackingAllowed()) return true;
  const umami = (window as unknown as { umami?: UmamiLike }).umami;
  if (!umami?.track) return false;
  try {
    umami.track((base) => buildEventPayload(base, name, data));
  } catch {
    // Analytics must never break the game.
  }
  return true;
}

/**
 * Send a promo event. The strip appears on first load, which is usually
 * BEFORE the async tracker script has finished loading — so an event raised
 * then waits for it (polling, up to TRACKER_WAIT_MS) instead of being dropped.
 * Without this every first-load impression went uncounted.
 */
export function trackPromo(name: PromoEvent, data: Record<string, string> = { variant: 'strip' }): void {
  if (!trackingAllowed()) return;
  if (send(name, data)) return;
  let waited = 0;
  const id = setInterval(() => {
    waited += TRACKER_POLL_MS;
    if (send(name, data) || waited >= TRACKER_WAIT_MS) clearInterval(id);
  }, TRACKER_POLL_MS);
}
