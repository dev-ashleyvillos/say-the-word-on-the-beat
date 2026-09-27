// Gameplayce promo strip — display rules (gameplayce.io#1348, variant A).
//
// Pure logic, no React and no DOM, so every rule in the issue's table is unit
// tested (promo.test.ts). The strip is deliberately rare:
//   - it shows as soon as the page loads — no engagement wait (the operator's
//     call, 2026-09-27: "show it immediately"; it used to wait for a finished
//     round or 90 s of idle time);
//   - never while the privacy panel, the full-screen player or a dialog is up;
//   - at most once per page visit, at most 3 times ever, not again for 7 days
//     after an ignored impression;
//   - × hides it for 90 days; clicking the CTA hides it for good.

export const PROMO_STORAGE_KEY = 'stw.promo';
export const PROMO_MAX_IMPRESSIONS = 3;
const DAY = 24 * 60 * 60 * 1000;
export const PROMO_IGNORED_COOLDOWN_MS = 7 * DAY;
export const PROMO_DISMISS_SNOOZE_MS = 90 * DAY;

export const PROMO_URL =
  'https://gameplayce.io/games/say-the-word-on-beat?utm_source=saywordsonbeat&utm_medium=promo&utm_campaign=stw-ai&utm_content=strip';

export interface PromoRecord {
  shown: number;
  lastShownAt: number | null;
  snoozeUntil: number | null;
  clicked: boolean;
}

export const EMPTY_RECORD: PromoRecord = { shown: 0, lastShownAt: null, snoozeUntil: null, clicked: false };

/** Parse whatever is stored; anything malformed counts as a fresh record. */
export function parseRecord(raw: string | null | undefined): PromoRecord {
  if (!raw) return { ...EMPTY_RECORD };
  try {
    const v = JSON.parse(raw) as Partial<PromoRecord>;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    return {
      shown: typeof v.shown === 'number' && v.shown >= 0 ? Math.floor(v.shown) : 0,
      lastShownAt: num(v.lastShownAt),
      snoozeUntil: num(v.snoozeUntil),
      clicked: v.clicked === true,
    };
  } catch {
    return { ...EMPTY_RECORD };
  }
}

/** Long-term eligibility: the stored record alone, independent of this visit. */
export function isRecordEligible(record: PromoRecord, now: number): boolean {
  if (record.clicked) return false;
  if (record.shown >= PROMO_MAX_IMPRESSIONS) return false;
  if (record.snoozeUntil !== null && now < record.snoozeUntil) return false;
  if (record.lastShownAt !== null && now - record.lastShownAt < PROMO_IGNORED_COOLDOWN_MS) return false;
  return true;
}

export interface VisitState {
  /** Already shown once in this page visit. */
  shownThisVisit: boolean;
}

export interface Blockers {
  consentBannerVisible: boolean;
  playbackVisible: boolean;
  dialogOpen: boolean;
}

export function isBlocked(b: Blockers): boolean {
  return b.consentBannerVisible || b.playbackVisible || b.dialogOpen;
}

/** Should the strip appear now? */
export function shouldShowPromo(record: PromoRecord, visit: VisitState, blockers: Blockers, now: number): boolean {
  if (visit.shownThisVisit) return false;
  if (isBlocked(blockers)) return false;
  return isRecordEligible(record, now);
}

export function recordShown(record: PromoRecord, now: number): PromoRecord {
  return { ...record, shown: record.shown + 1, lastShownAt: now };
}

export function recordDismissed(record: PromoRecord, now: number): PromoRecord {
  return { ...record, snoozeUntil: now + PROMO_DISMISS_SNOOZE_MS };
}

export function recordClicked(record: PromoRecord): PromoRecord {
  return { ...record, clicked: true };
}

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadRecord(s: Storage | undefined = storage()): PromoRecord {
  try {
    return parseRecord(s?.getItem(PROMO_STORAGE_KEY));
  } catch {
    return { ...EMPTY_RECORD };
  }
}

export function saveRecord(record: PromoRecord, s: Storage | undefined = storage()): void {
  try {
    s?.setItem(PROMO_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Unwritable storage: the in-memory "once per visit" cap still holds.
  }
}
