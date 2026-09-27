import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isBlocked,
  loadRecord,
  recordClicked,
  recordDismissed,
  recordShown,
  saveRecord,
  shouldShowPromo,
  type Blockers,
} from '@/lib/promo'
import { trackPromo } from '@/lib/track'

/**
 * Drives the Gameplayce promo strip (gameplayce.io#1348). All rules live in lib/promo.ts;
 * this hook only feeds it what is currently on screen. It shows as soon as the
 * admin setting has loaded and nothing blocks it.
 *
 * Two separate things:
 *   - the impression latch (`shownThisVisit`): set once, when the strip first
 *     appears unobstructed — that is the one impression this visit counts;
 *   - render visibility: the latched strip is hidden again whenever a blocker
 *     comes back (consent banner re-opened, playback, any dialog) and returns
 *     when it clears, without counting another impression.
 */
export function usePromo(opts: { enabled: boolean; blockers: Blockers }) {
  const { enabled, blockers } = opts
  const [shown, setShown] = useState(false)
  const [closed, setClosed] = useState(false)
  const shownThisVisit = useRef(false)
  const blocked = isBlocked(blockers)

  const { consentBannerVisible, playbackVisible, dialogOpen } = blockers
  useEffect(() => {
    // Switched off by the admin (or the setting could not be loaded): never
    // latch, so no impression is counted for a strip nobody saw.
    if (!enabled || shownThisVisit.current) return
    const now = Date.now()
    const record = loadRecord()
    const ok = shouldShowPromo(
      record,
      { shownThisVisit: false },
      { consentBannerVisible, playbackVisible, dialogOpen },
      now,
    )
    if (!ok) return
    shownThisVisit.current = true
    saveRecord(recordShown(record, now))
    setShown(true)
    trackPromo('promo:shown')
  }, [enabled, consentBannerVisible, playbackVisible, dialogOpen])

  const dismiss = useCallback(() => {
    saveRecord(recordDismissed(loadRecord(), Date.now()))
    setClosed(true)
    trackPromo('promo:dismiss')
  }, [])

  const click = useCallback(() => {
    saveRecord(recordClicked(loadRecord()))
    trackPromo('promo:click')
    setClosed(true)
  }, [])

  return { visible: enabled && shown && !closed && !blocked, dismiss, click }
}
