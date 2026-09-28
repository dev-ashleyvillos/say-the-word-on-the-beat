/**
 * Share configuration hook
 * 
 * Manages loading game configurations from URL parameters and generating share links.
 */

import { useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { shareApi } from '@/hooks/useLocalStorage'
import { 
  isValidDataUrl, 
  validateNumber, 
  validateDifficulty, 
  sanitizeUrlParam, 
  isValidGuid 
} from '@/lib/security'
import {
  BPM_MIN,
  BPM_MAX,
  ROUNDS_MIN,
  ROUNDS_MAX,
  SPEED_INCREASE_MIN,
  SPEED_INCREASE_MAX,
  COUNTDOWN_MIN,
  COUNTDOWN_MAX,
  MAX_CONTENT_ITEMS,
  DEFAULT_BPM,
  DEFAULT_DIFFICULTY,
  DEFAULT_ROUNDS,
  DEFAULT_SPEED_INCREASE_PERCENT,
  DEFAULT_CONTENT_POOL,
} from '@/lib/constants'
import type { Difficulty, ShareConfig, ShareOptions } from '@/lib/types'
import type { BpmAnalysisResult } from '@/lib/bpmAnalyzer'
import type { ContentPoolItem } from '@/components/ContentPoolManager'

interface UseShareConfigOptions {
  // Current state values for generating share links
  currentBpm: number
  currentBaseBpm: number
  currentDifficulty: Difficulty
  currentSequential: boolean
  currentContentPool: ContentPoolItem[]
  customAudio: string | null
  currentBpmAnalysis: BpmAnalysisResult | null
  currentAudioStartTime: number
  currentRounds: number
  currentIncreaseSpeed: boolean
  currentSpeedIncreasePercent: number

  // State setters for loading configs
  setBpm: (value: number) => void
  setBaseBpm: (value: number) => void
  setDifficulty: (value: Difficulty) => void
  setSequential: (value: boolean) => void
  setContentPool: (items: ContentPoolItem[]) => void
  setCustomAudio: (url: string | null) => void
  setBpmAnalysis: (analysis: BpmAnalysisResult | null) => void
  setAudioStartTime: (time: number) => void
  setRounds: (value: number) => void
  setIncreaseSpeed: (value: boolean) => void
  setSpeedIncreasePercent: (value: number) => void
  setCountdownDuration: (value: number) => void
}

/**
 * Normalize content items from various legacy formats to ContentPoolItem[].
 */
function normalizeContentItems(
  items: unknown
): ContentPoolItem[] {
  if (!Array.isArray(items)) return []
  
  return items
    .map((item): ContentPoolItem | null => {
      if (typeof item === 'string') {
        return { content: item, type: 'image' }
      }
      // Handle legacy ImagePoolItem format with 'url' property
      if (item && typeof item === 'object' && 'url' in item) {
        const legacyItem = item as { url: string; word?: string }
        return { content: legacyItem.url, type: 'image', word: legacyItem.word }
      }
      // Already in ContentPoolItem format
      if (item && typeof item === 'object' && 'content' in item && 'type' in item) {
        return item as ContentPoolItem
      }
      return null
    })
    .filter((item): item is ContentPoolItem => {
      if (!item) return false
      // Validate data URLs for images
      if (item.type === 'image' && !isValidDataUrl(item.content)) {
        console.warn('Invalid image data URL format detected')
        return false
      }
      return true
    })
    .slice(0, MAX_CONTENT_ITEMS)
}

/**
 * Apply a validated config to state setters.
 *
 * A link is meant to be a reliable, repeatable snapshot, so every field is
 * set explicitly here - to the config's value if valid, otherwise to the
 * app's own default - rather than being skipped and left at whatever this
 * browser happened to have from a previous visit.
 */
function applyConfig(
  config: ShareConfig,
  setters: Pick<UseShareConfigOptions,
    'setBpm' | 'setBaseBpm' | 'setDifficulty' | 'setSequential' | 'setContentPool' |
    'setCustomAudio' | 'setBpmAnalysis' | 'setAudioStartTime' | 'setRounds' |
    'setIncreaseSpeed' | 'setSpeedIncreasePercent'
  >
) {
  const {
    setBpm, setBaseBpm, setDifficulty, setSequential, setContentPool,
    setCustomAudio, setBpmAnalysis, setAudioStartTime, setRounds,
    setIncreaseSpeed, setSpeedIncreasePercent
  } = setters

  const bpmValidation = validateNumber(config.bpm, BPM_MIN, BPM_MAX, 'BPM')
  setBpm(bpmValidation.valid ? config.bpm : DEFAULT_BPM)

  const baseBpm = config.baseBpm ?? DEFAULT_BPM
  const baseBpmValidation = validateNumber(baseBpm, BPM_MIN, BPM_MAX, 'Base BPM')
  setBaseBpm(baseBpmValidation.valid ? baseBpm : DEFAULT_BPM)

  setDifficulty(
    config.difficulty && validateDifficulty(config.difficulty) ? config.difficulty : DEFAULT_DIFFICULTY
  )

  // Fixed-order playback: always set explicitly so an old value can't linger.
  setSequential(!!config.sequential)

  // Normalize content (supports legacy 'images' format), falling back to the
  // app's own default pool if nothing valid survives normalization.
  const contentItems = config.content || config.images
  const validItems = normalizeContentItems(contentItems)
  setContentPool(validItems.length > 0 ? validItems : DEFAULT_CONTENT_POOL)

  setCustomAudio(config.audio && isValidDataUrl(config.audio) ? config.audio : null)
  setBpmAnalysis(config.bpmAnalysis ?? null)
  setAudioStartTime(typeof config.audioStartTime === 'number' ? config.audioStartTime : 0)

  const roundsValidation = validateNumber(config.rounds, ROUNDS_MIN, ROUNDS_MAX, 'Rounds')
  setRounds(roundsValidation.valid ? config.rounds : DEFAULT_ROUNDS)

  setIncreaseSpeed(config.increaseSpeed ?? false)

  const speedIncreasePercent = config.speedIncreasePercent ?? DEFAULT_SPEED_INCREASE_PERCENT
  const speedValidation = validateNumber(
    speedIncreasePercent,
    SPEED_INCREASE_MIN,
    SPEED_INCREASE_MAX,
    'Speed increase'
  )
  setSpeedIncreasePercent(speedValidation.valid ? speedIncreasePercent : DEFAULT_SPEED_INCREASE_PERCENT)
}

export function useShareConfig(options: UseShareConfigOptions) {
  const {
    currentBpm,
    currentBaseBpm,
    currentDifficulty,
    currentSequential,
    currentContentPool,
    customAudio,
    currentBpmAnalysis,
    currentAudioStartTime,
    currentRounds,
    currentIncreaseSpeed,
    currentSpeedIncreasePercent,
    setBpm,
    setBaseBpm,
    setDifficulty,
    setSequential,
    setContentPool,
    setCustomAudio,
    setBpmAnalysis,
    setAudioStartTime,
    setRounds,
    setIncreaseSpeed,
    setSpeedIncreasePercent,
    setCountdownDuration,
  } = options

  const hasLoadedFromUrl = useRef(false)

  /**
   * Generate a shareable link with current game configuration.
   */
  const generateShareLink = useCallback(async (shareOptions: ShareOptions): Promise<string> => {
    try {
      const config: ShareConfig = {
        bpm: currentBpm,
        baseBpm: currentBaseBpm,
        difficulty: currentDifficulty,
        sequential: currentSequential,
        content: currentContentPool,
        audio: customAudio,
        bpmAnalysis: currentBpmAnalysis,
        audioStartTime: currentAudioStartTime,
        rounds: currentRounds,
        increaseSpeed: currentIncreaseSpeed,
        speedIncreasePercent: currentSpeedIncreasePercent
        // Note: countdownDuration is excluded - admin-only parameter
      }
      
      const guid = await shareApi.create(config as unknown as Record<string, unknown>, { 
        isPublic: shareOptions.isPublic, 
        title: shareOptions.title,
        _submit_time: shareOptions._submit_time
      })
      
      const url = new URL(window.location.href)
      url.searchParams.delete('config')
      url.searchParams.set('share', guid)
      
      return url.toString()
    } catch (error) {
      throw new Error('Failed to generate share link')
    }
  }, [
    currentBpm, currentBaseBpm, currentDifficulty, currentSequential, currentContentPool,
    customAudio, currentBpmAnalysis, currentAudioStartTime,
    currentRounds, currentIncreaseSpeed, currentSpeedIncreasePercent
  ])

  /**
   * Save current game configuration back onto an already-loaded share (Save Changes),
   * rather than creating a new one.
   */
  const updateSharedGame = useCallback(async (guid: string): Promise<void> => {
    const config: ShareConfig = {
      bpm: currentBpm,
      baseBpm: currentBaseBpm,
      difficulty: currentDifficulty,
      sequential: currentSequential,
      content: currentContentPool,
      audio: customAudio,
      bpmAnalysis: currentBpmAnalysis,
      audioStartTime: currentAudioStartTime,
      rounds: currentRounds,
      increaseSpeed: currentIncreaseSpeed,
      speedIncreasePercent: currentSpeedIncreasePercent
    }

    await shareApi.update(guid, config as unknown as Record<string, unknown>)
  }, [
    currentBpm, currentBaseBpm, currentDifficulty, currentSequential, currentContentPool,
    customAudio, currentBpmAnalysis, currentAudioStartTime,
    currentRounds, currentIncreaseSpeed, currentSpeedIncreasePercent
  ])

  /**
   * Load game configuration from URL parameters.
   * Supports both ?share=GUID and legacy ?config=BASE64 formats.
   */
  const loadFromUrl = useCallback(async () => {
    if (hasLoadedFromUrl.current) return

    const urlParams = new URLSearchParams(window.location.search)
    const shareIdRaw = urlParams.get('share')
    const configParamRaw = urlParams.get('config')

    const shareId = sanitizeUrlParam(shareIdRaw)
    const configParam = sanitizeUrlParam(configParamRaw)

    // Claim the load before the first await so a duplicate effect run (e.g.
    // React StrictMode's double-invoke) can't fire a second, concurrent
    // fetch that races this one and applies its config out of order.
    if (shareId || configParam) {
      hasLoadedFromUrl.current = true
    }

    try {
      const setters = {
        setBpm, setBaseBpm, setDifficulty, setSequential, setContentPool,
        setCustomAudio, setBpmAnalysis, setAudioStartTime, setRounds,
        setIncreaseSpeed, setSpeedIncreasePercent
      }

      if (shareId) {
        // Load from share API
        if (!isValidGuid(shareId)) {
          toast.error('Invalid share link format')
          return
        }

        const config = await shareApi.get(shareId) as ShareConfig | null

        if (config) {
          applyConfig(config, setters)
          toast.success('Loaded shared game configuration!')
        } else {
          toast.error('Share link not found')
        }
      } else if (configParam) {
        // Legacy: Load from base64-encoded config
        try {
          const decoded = JSON.parse(atob(configParam)) as ShareConfig
          applyConfig(decoded, setters)
          toast.success('Loaded game configuration!')
        } catch (error) {
          console.error('Failed to parse config:', error)
          if (error instanceof SyntaxError) {
            toast.error('Invalid configuration format - corrupted data')
          } else {
            toast.error('Failed to load configuration')
          }
        }
      }
      
      // Admin-only: countdown duration via URL parameter
      const adminCountdown = urlParams.get('admin_countdown')
      if (adminCountdown) {
        const sanitized = sanitizeUrlParam(adminCountdown)
        if (sanitized) {
          const countdownValue = parseFloat(sanitized)
          if (!isNaN(countdownValue)) {
            const validation = validateNumber(
              countdownValue, 
              COUNTDOWN_MIN, 
              COUNTDOWN_MAX, 
              'Admin countdown duration'
            )
            if (validation.valid) {
              setCountdownDuration(countdownValue)
              console.log(`Admin countdown duration set to: ${countdownValue}s`)
            } else {
              console.warn(`Invalid admin_countdown value: ${validation.error}`)
            }
          }
        }
      }
    } catch (error) {
      console.error('Load error:', error)
      if (error instanceof TypeError) {
        toast.error('Network error loading shared configuration')
      } else {
        toast.error('Failed to load configuration')
      }
    }
  }, [
    setBpm, setBaseBpm, setDifficulty, setSequential, setContentPool,
    setCustomAudio, setBpmAnalysis, setAudioStartTime, setRounds,
    setIncreaseSpeed, setSpeedIncreasePercent, setCountdownDuration
  ])

  /**
   * Load a public game by GUID.
   */
  const loadPublicGame = useCallback(async (guid: string) => {
    try {
      const config = await shareApi.get(guid) as ShareConfig | null

      if (!config) {
        throw new Error('Game not found')
      }

      const setters = {
        setBpm, setBaseBpm, setDifficulty, setSequential, setContentPool,
        setCustomAudio, setBpmAnalysis, setAudioStartTime, setRounds,
        setIncreaseSpeed, setSpeedIncreasePercent
      }

      applyConfig(config, setters)

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' })

    } catch (error) {
      console.error('Failed to load public game:', error)
      throw error
    }
  }, [
    setBpm, setBaseBpm, setDifficulty, setSequential, setContentPool,
    setCustomAudio, setBpmAnalysis, setAudioStartTime, setRounds,
    setIncreaseSpeed, setSpeedIncreasePercent
  ])

  return {
    generateShareLink,
    updateSharedGame,
    loadFromUrl,
    loadPublicGame,
    hasLoadedFromUrl,
  }
}
