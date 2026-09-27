/**
 * Shared type definitions for the Say the Word on Beat game
 */

import type { BpmAnalysisResult } from './bpmAnalyzer'
import type { ContentPoolItem } from '@/components/ContentPoolManager'

// ============================================================================
// Grid & Content Types
// ============================================================================

/** A single item displayed in the game grid */
export interface GridItem {
  content: string
  type: 'emoji' | 'image'
  word?: string
}

/** Difficulty level affects how items repeat in the grid */
export type Difficulty = 'easy' | 'medium' | 'hard'

// ============================================================================
// Game State Types
// ============================================================================

/** Persistent game settings (saved to localStorage) */
export interface GameSettings {
  contentPool: ContentPoolItem[]
  difficulty: Difficulty
  gridItems: GridItem[]
  bpm: number
  baseBpm: number
  customAudio: string | null
  bpmAnalysis: BpmAnalysisResult | null
  audioStartTime: number
  rounds: number
  increaseSpeed: boolean
  speedIncreasePercent: number
  countdownDuration: number
}

/** Transient playback state (not persisted) */
export interface PlaybackState {
  isPlaying: boolean
  isFullscreen: boolean
  isFinished: boolean
  activeIndex: number | null
  revealedIndices: Set<number>
  currentRound: number
  countdown: number | null
  displayBpm: number
}

// ============================================================================
// Shared Configuration Types
// ============================================================================

/** Configuration object for share links */
export interface ShareConfig {
  bpm: number
  baseBpm?: number
  difficulty: Difficulty
  content?: ContentPoolItem[]
  /** @deprecated Use content instead */
  images?: ContentPoolItem[] | string[]
  audio: string | null
  bpmAnalysis?: BpmAnalysisResult | null
  audioStartTime?: number
  rounds: number
  increaseSpeed?: boolean
  speedIncreasePercent?: number
  /** Play the content pool in its stored order instead of randomizing (no UI toggle; set only via loaded share configs) */
  sequential?: boolean
}

/** Options for generating a share link */
export interface ShareOptions {
  isPublic: boolean
  title: string
  _submit_time?: number
}
