/**
 * Game configuration constants
 * 
 * Centralized configuration values for the Say the Word on Beat game.
 * Adjust these values to tune game timing and behavior.
 */

import type { ContentPoolItem } from '@/components/ContentPoolManager'

// ============================================================================
// Timing Configuration
// ============================================================================

/**
 * How many beats each card is shown for.
 * - 1.0 = one card per beat (quarter notes)
 * - 2/3 = 1.5 cards per beat (triplets)
 * - 0.5 = two cards per beat (eighth notes - current default)
 * - 0.25 = four cards per beat (sixteenth notes)
 * 
 * Use musical subdivisions (1, 2/3, 0.5, 0.25) to stay "on the beat"
 */
export const BEATS_PER_CARD = .5

/**
 * Base playback speed multiplier.
 * - 1.0 = normal speed
 * - 0.9 = 10% slower (more relaxed feel)
 * - 0.85 = 15% slower
 * 
 * This slows down both audio and card timing proportionally,
 * keeping everything in sync while adjusting the overall pace.
 */
export const BASE_SPEED_MULTIPLIER = 1

/**
 * Default BPM used when no custom audio is provided.
 * This matches the built-in audio file's tempo.
 */
export const DEFAULT_BPM = 91

/**
 * How often (in ms) to check audio position for dynamic BPM updates.
 * Lower values = more responsive but more CPU usage.
 */
export const BPM_CHECK_INTERVAL = 100

/**
 * Minimum BPM change required to update the beat interval.
 * Prevents jittery updates from small fluctuations.
 */
export const BPM_CHANGE_THRESHOLD = 1

// ============================================================================
// Grid Configuration
// ============================================================================

/** Number of items displayed in the game grid */
export const GRID_SIZE = 8

// ============================================================================
// Animation Configuration
// ============================================================================

/** Minimum transition duration for card animations (ms) */
export const MIN_TRANSITION_DURATION = 50

/** Maximum transition duration for card animations (ms) */
export const MAX_TRANSITION_DURATION = 300

/** Percentage of beat interval used for transition (0-1) */
export const TRANSITION_DURATION_RATIO = 0.8

// ============================================================================
// Validation Limits
// ============================================================================

export const BPM_MIN = 60
export const BPM_MAX = 180
export const ROUNDS_MIN = 1
export const ROUNDS_MAX = 10
export const SPEED_INCREASE_MIN = 0
export const SPEED_INCREASE_MAX = 100
export const COUNTDOWN_MIN = 0.5
export const COUNTDOWN_MAX = 10
// Fixed Order chunks the pool into GRID_SIZE-sized rounds, so this must stay
// a comfortable multiple of GRID_SIZE.
export const MAX_CONTENT_ITEMS = 64

// ============================================================================
// Setting Defaults
// ============================================================================
// Shared between App.tsx's initial state and useShareConfig's fallback values,
// so a link that's missing/invalid a field resolves to the same default the
// app itself uses rather than an arbitrary hardcoded number.

export const DEFAULT_DIFFICULTY = 'medium'
export const DEFAULT_ROUNDS = 5
export const DEFAULT_SPEED_INCREASE_PERCENT = 5

// ============================================================================
// Default Content
// ============================================================================

/** Expanded emoji pool for random selection when no content is provided */
export const DEFAULT_EMOJIS = [
  '🐱', '🐶', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸',
  '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍑', '🥭', '🍍', '🥝',
  '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🎱', '🏓', '🏸', '🥊',
  '🔔', '🧱', '🕐', '🪨', '⭐', '🌙', '☀️', '🌈', '❄️', '🔥',
  '🎸', '🎹', '🥁', '🎺', '🎻', '🎤', '🎧', '📚', '✏️', '🔑',
  '🧢', '🦇', '🐝', '🦋', '🐛', '🌸', '🌻', '🌹', '🍀', '🌵'
]

/** Default content pool - empty so random emojis are used when playing */
export const DEFAULT_CONTENT_POOL: ContentPoolItem[] = []

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate the interval between card changes in milliseconds.
 * Uses BEATS_PER_CARD to determine how many cards appear per musical beat.
 * 
 * @param bpm - Beats per minute
 * @returns Interval in milliseconds
 * 
 * @example
 * calculateBeatInterval(91)  // At 0.5 BEATS_PER_CARD: ~330ms
 * calculateBeatInterval(120) // At 0.5 BEATS_PER_CARD: 250ms
 */
export const calculateBeatInterval = (bpm: number): number => 
  (60 / bpm) * 1000 * BEATS_PER_CARD

/**
 * Calculate the transition duration for card animations.
 * Clamps the duration between MIN and MAX values.
 * 
 * @param bpm - Current beats per minute
 * @returns Transition duration in milliseconds
 */
export const calculateTransitionDuration = (bpm: number): number => {
  const interval = calculateBeatInterval(bpm)
  return Math.max(
    MIN_TRANSITION_DURATION,
    Math.min(MAX_TRANSITION_DURATION, interval * TRANSITION_DURATION_RATIO)
  )
}
