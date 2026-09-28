/**
 * Game playback logic hook
 * 
 * Manages the beat sequencing, audio synchronization, and round progression
 * during active gameplay.
 */

import { useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { getBpmAtTime, type BpmAnalysisResult } from '@/lib/bpmAnalyzer'
import { generateGridFromPool, chunkContentPool, isSequentialPoolSizeValid } from '@/lib/gridGenerator'
import {
  calculateBeatInterval,
  BPM_CHECK_INTERVAL,
  BPM_CHANGE_THRESHOLD,
  BASE_SPEED_MULTIPLIER,
  DEFAULT_BPM,
  GRID_SIZE
} from '@/lib/constants'
import type { GridItem, Difficulty } from '@/lib/types'
import type { ContentPoolItem } from '@/components/ContentPoolManager'

interface UseGamePlaybackOptions {
  // Game settings
  currentBpm: number
  currentBaseBpm: number
  currentRounds: number
  currentDifficulty: Difficulty
  currentSequential: boolean
  currentContentPool: ContentPoolItem[]
  currentIncreaseSpeed: boolean
  currentSpeedIncreasePercent: number
  currentCountdownDuration: number
  currentAudioStartTime: number
  currentBpmAnalysis: BpmAnalysisResult | null
  customAudio: string | null
  displayedGridItems: GridItem[]
  
  // State setters
  setIsPlaying: (value: boolean) => void
  setIsFullscreen: (value: boolean) => void
  setIsFinished: (value: boolean) => void
  setActiveIndex: (value: number | null) => void
  setRevealedIndices: (value: Set<number> | ((prev: Set<number>) => Set<number>)) => void
  setCurrentRound: (value: number) => void
  setCountdown: (value: number | null | ((prev: number | null) => number | null)) => void
  setDisplayBpm: (value: number) => void
  setGridItems: (items: GridItem[]) => void
  setIsAppearancePhase: (value: boolean) => void
  
  // Audio refs
  customAudioRef: React.RefObject<HTMLAudioElement | null>
  defaultAudioRef: React.RefObject<HTMLAudioElement | null>
  completeSoundRef: React.RefObject<HTMLAudioElement | null>
}

export function useGamePlayback(options: UseGamePlaybackOptions) {
  const {
    currentBpm,
    currentBaseBpm,
    currentRounds,
    currentDifficulty,
    currentSequential,
    currentContentPool,
    currentIncreaseSpeed,
    currentSpeedIncreasePercent,
    currentCountdownDuration,
    currentAudioStartTime,
    currentBpmAnalysis,
    customAudio,
    displayedGridItems,
    setIsPlaying,
    setIsFullscreen,
    setIsFinished,
    setActiveIndex,
    setRevealedIndices,
    setCurrentRound,
    setCountdown,
    setDisplayBpm,
    setGridItems,
    setIsAppearancePhase,
    customAudioRef,
    defaultAudioRef,
    completeSoundRef,
  } = options

  // Refs for interval management
  const intervalRef = useRef<number | null>(null)
  const bpmCheckIntervalRef = useRef<number | null>(null)

  // ============================================================================
  // BPM Calculations
  // ============================================================================

  const baseBpmValue = customAudio ? currentBaseBpm : DEFAULT_BPM
  const basePlaybackSpeed = (currentBpm / baseBpmValue) * BASE_SPEED_MULTIPLIER

  /**
   * Calculate the effective BPM for a given round and audio position.
   * Accounts for custom audio tempo detection and speed increase settings.
   */
  const calculateRoundBpm = useCallback((roundNumber: number, audioTime?: number) => {
    let effectiveBpm = currentBpm
    
    // For custom audio with BPM analysis, detect tempo at current position
    if (customAudio && currentBpmAnalysis && audioTime !== undefined) {
      const detectedBpm = getBpmAtTime(currentBpmAnalysis.segments, audioTime)
      const speedMultiplier = currentBpm / currentBaseBpm
      effectiveBpm = detectedBpm * speedMultiplier
    }
    
    // Apply round-based speed increase if enabled
    if (!currentIncreaseSpeed) return effectiveBpm
    
    const speedMultiplier = 1 + ((currentSpeedIncreasePercent / 100) * (roundNumber - 1))
    return effectiveBpm * speedMultiplier
  }, [currentBpm, currentBaseBpm, customAudio, currentBpmAnalysis, currentIncreaseSpeed, currentSpeedIncreasePercent])

  /**
   * Calculate the audio playback rate for a given round.
   */
  const calculatePlaybackSpeed = useCallback((roundNumber: number) => {
    if (!currentIncreaseSpeed) return basePlaybackSpeed
    const speedMultiplier = 1 + ((currentSpeedIncreasePercent / 100) * (roundNumber - 1))
    return basePlaybackSpeed * speedMultiplier
  }, [basePlaybackSpeed, currentIncreaseSpeed, currentSpeedIncreasePercent])

  // ============================================================================
  // Playback Control
  // ============================================================================

  /**
   * Begin the beat sequence after countdown completes.
   * Each round has two phases:
   * 1. Appearance phase: Cards appear one by one with animation
   * 2. Highlight phase: Cards are highlighted one by one with yellow frame
   */
  const beginPlayback = useCallback(() => {
    setIsPlaying(true)
    // Note: revealedIndices and isAppearancePhase are already set in startBeat
    let index = -1
    let roundCount = 1
    let isInAppearancePhase = true // Local tracking for the closure

    // Fixed Order plays a round as one or more GRID_SIZE-sized chunks in
    // sequence; chunkIndex only advances the round once the last chunk finishes.
    const sequentialChunks = currentSequential ? chunkContentPool(currentContentPool) : null
    let chunkIndex = 0

    const audioRef = customAudio ? customAudioRef : defaultAudioRef
    
    const initialBpm = calculateRoundBpm(roundCount, 0)
    setDisplayBpm(Math.round(initialBpm))
    let currentIntervalBpm = initialBpm
    
    /**
     * Dynamically update BPM based on audio position for variable-tempo tracks.
     */
    const updateBpmFromAudio = () => {
      if (audioRef.current && customAudio && currentBpmAnalysis) {
        const audioTime = audioRef.current.currentTime / audioRef.current.playbackRate
        const newBpm = calculateRoundBpm(roundCount, audioTime)
        
        setDisplayBpm(Math.round(newBpm))
        
        // Only update interval if BPM changed significantly
        if (Math.abs(newBpm - currentIntervalBpm) > BPM_CHANGE_THRESHOLD) {
          currentIntervalBpm = newBpm
          
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
          }
          
          const newInterval = calculateBeatInterval(currentIntervalBpm)
          intervalRef.current = window.setInterval(playSequence, newInterval)
        }
      }
    }
    
    // Set up continuous BPM monitoring for custom audio
    if (customAudio && currentBpmAnalysis) {
      bpmCheckIntervalRef.current = window.setInterval(updateBpmFromAudio, BPM_CHECK_INTERVAL)
    }
    
    /**
     * Get the beat interval for a specific round.
     */
    const getIntervalForRound = (round: number, audioTime?: number) => {
      const roundBpm = calculateRoundBpm(round, audioTime)
      return calculateBeatInterval(roundBpm)
    }
    
    // Track current grid size (may change between rounds)
    let currentGridSize = displayedGridItems.length
    let completedFirstCard = false // Track if we've shown at least one card
    
    /**
     * Main sequence function - advances to next card on each beat.
     * Handles both appearance and highlight phases.
     */
    const playSequence = () => {
      index = (index + 1) % currentGridSize
      
      // Check for phase/round completion when we wrap back to 0 (after showing all cards)
      if (index === 0 && completedFirstCard) {
        if (isInAppearancePhase) {
          // Finished appearance phase, switch to highlight phase
          isInAppearancePhase = false
          setIsAppearancePhase(false)
          // Don't reset revealedIndices - keep all cards visible
          // index is already 0, so we start highlighting from the beginning
        } else if (sequentialChunks && chunkIndex < sequentialChunks.length - 1) {
          // Finished this chunk's highlight phase, but more chunks remain in
          // this round - advance the chunk without touching the round count.
          chunkIndex++
          const nextChunk = sequentialChunks[chunkIndex]
          const newGrid = nextChunk.map(item => ({ content: item.content, type: item.type, word: item.word }))
          setGridItems(newGrid)
          currentGridSize = newGrid.length

          setRevealedIndices(new Set())
          isInAppearancePhase = true
          setIsAppearancePhase(true)
        } else {
          // Finished the last (or only) chunk - the round is complete
          chunkIndex = 0
          roundCount++

          // Check if game is complete
          if (roundCount > currentRounds) {
            // Game complete!
            if (intervalRef.current) {
              clearInterval(intervalRef.current)
              intervalRef.current = null
            }
            if (bpmCheckIntervalRef.current) {
              clearInterval(bpmCheckIntervalRef.current)
              bpmCheckIntervalRef.current = null
            }
            setIsPlaying(false)
            setActiveIndex(null)
            setIsFinished(true)

            // Fade out the music over 1 second
            if (audioRef.current) {
              const audio = audioRef.current
              const fadeInterval = 50 // Update every 50ms
              const fadeSteps = 1000 / fadeInterval // 20 steps over 1 second
              const volumeStep = audio.volume / fadeSteps

              const fadeOut = setInterval(() => {
                if (audio.volume > volumeStep) {
                  audio.volume -= volumeStep
                } else {
                  audio.volume = 0
                  audio.pause()
                  audio.volume = 1 // Reset volume for next play
                  clearInterval(fadeOut)
                }
              }, fadeInterval)
            }

            // Play completion sound
            if (completeSoundRef.current) {
              completeSoundRef.current.currentTime = 0
              completeSoundRef.current.play().catch(err =>
                console.debug('Complete sound play error:', err)
              )
            }
            return
          }

          // Start new round with fresh grid (first chunk, for Fixed Order)
          const newGrid = generateGridFromPool(currentContentPool, currentDifficulty, currentSequential)
          setGridItems(newGrid)
          currentGridSize = newGrid.length

          // Reset for new round - start with appearance phase again
          setRevealedIndices(new Set())
          setCurrentRound(roundCount)
          isInAppearancePhase = true
          setIsAppearancePhase(true)

          // Update playback speed for new round
          if (audioRef.current) {
            audioRef.current.playbackRate = calculatePlaybackSpeed(roundCount)
          }

          // Update interval for non-analyzed audio
          if (!(customAudio && currentBpmAnalysis)) {
            const newBpm = calculateRoundBpm(roundCount)
            setDisplayBpm(Math.round(newBpm))

            if (intervalRef.current) {
              clearInterval(intervalRef.current)
            }
            intervalRef.current = window.setInterval(playSequence, getIntervalForRound(roundCount))
          }
        }
      }
      
      // Mark that we've completed at least one card
      completedFirstCard = true
      
      if (isInAppearancePhase) {
        // Appearance phase: reveal cards one by one, no highlight
        setActiveIndex(null)
        setRevealedIndices(prev => new Set([...prev, index]))
      } else {
        // Highlight phase: highlight cards with yellow frame
        setActiveIndex(index)
      }
    }
    
    // Start the sequence
    playSequence()
    const initialInterval = getIntervalForRound(roundCount, 0)
    intervalRef.current = window.setInterval(playSequence, initialInterval)
  }, [
    customAudio, customAudioRef, defaultAudioRef, completeSoundRef,
    currentBpmAnalysis, currentRounds, currentContentPool, currentDifficulty, currentSequential,
    displayedGridItems.length, calculateRoundBpm, calculatePlaybackSpeed,
    setIsPlaying, setRevealedIndices, setDisplayBpm, setActiveIndex,
    setIsFinished, setGridItems, setCurrentRound, setIsAppearancePhase
  ])

  /**
   * Start the game with countdown.
   */
  const startBeat = useCallback(() => {
    // Validate countdown duration
    if (currentCountdownDuration < 0.5) {
      toast.error('Invalid countdown duration')
      return
    }

    // Fixed Order pools over GRID_SIZE must divide evenly into GRID_SIZE-sized rounds
    if (currentSequential && !isSequentialPoolSizeValid(currentContentPool.length)) {
      toast.error(`Fixed Order needs a multiple of ${GRID_SIZE} items (currently ${currentContentPool.length})`)
      return
    }

    // Clear any stale intervals from a previous game
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (bpmCheckIntervalRef.current) {
      clearInterval(bpmCheckIntervalRef.current)
      bpmCheckIntervalRef.current = null
    }

    // Set appearance phase and clear revealed indices BEFORE showing fullscreen
    // This prevents a flash where all cards appear briefly
    setIsFinished(false)
    setIsAppearancePhase(true)
    setRevealedIndices(new Set())
    setIsFullscreen(true)
    setCurrentRound(1)
    
    // Start audio immediately with countdown
    const audioRef = customAudio ? customAudioRef : defaultAudioRef
    if (audioRef.current) {
      const startTime = customAudio && currentAudioStartTime > 0 
        ? currentAudioStartTime 
        : (customAudio && currentBpmAnalysis?.silenceOffset) || 0
      audioRef.current.currentTime = startTime
      audioRef.current.playbackRate = calculatePlaybackSpeed(1)
      audioRef.current.play().catch((error) => {
        console.error('Audio play error:', error)
        toast.error('Failed to play audio')
      })
    }
    
    // Calculate countdown interval (always 3, 2, 1)
    const intervalTime = Math.round((currentCountdownDuration * 1000) / 3)
    
    setCountdown(3)
    
    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownInterval)
          setTimeout(() => {
            setCountdown(null)
            beginPlayback()
          }, intervalTime)
          return null
        }
        return prev - 1
      })
    }, intervalTime)
  }, [
    currentCountdownDuration, currentAudioStartTime, currentBpmAnalysis,
    currentSequential, currentContentPool,
    customAudio, customAudioRef, defaultAudioRef, calculatePlaybackSpeed,
    setIsFullscreen, setCurrentRound, setCountdown, beginPlayback,
    setIsAppearancePhase, setRevealedIndices, setIsFinished
  ])

  /**
   * Stop playback and reset state.
   */
  const stopBeat = useCallback(() => {
    setIsPlaying(false)
    setActiveIndex(null)
    setRevealedIndices(new Set())
    setCurrentRound(0)
    setIsFullscreen(false)
    setCountdown(null)
    setIsFinished(false)
    setIsAppearancePhase(false)
    setDisplayBpm(customAudio && currentBpmAnalysis ? currentBaseBpm : DEFAULT_BPM)
    
    // Clear intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (bpmCheckIntervalRef.current) {
      clearInterval(bpmCheckIntervalRef.current)
      bpmCheckIntervalRef.current = null
    }
    
    // Reset audio
    if (customAudioRef.current) {
      customAudioRef.current.pause()
      const resetTime = currentAudioStartTime > 0 
        ? currentAudioStartTime 
        : (currentBpmAnalysis?.silenceOffset || 0)
      customAudioRef.current.currentTime = resetTime
      customAudioRef.current.playbackRate = 1
    }
    if (defaultAudioRef.current) {
      defaultAudioRef.current.pause()
      defaultAudioRef.current.currentTime = 0
      defaultAudioRef.current.playbackRate = 1
    }
  }, [
    customAudio, currentBaseBpm, currentBpmAnalysis, currentAudioStartTime,
    customAudioRef, defaultAudioRef,
    setIsPlaying, setActiveIndex, setRevealedIndices, setCurrentRound,
    setIsFullscreen, setCountdown, setIsFinished, setDisplayBpm, setIsAppearancePhase
  ])

  /**
   * Toggle play/pause state.
   */
  const handlePlayPause = useCallback(() => {
    // Note: isPlaying check needs to be done by the caller
    // This is a simplified toggle
  }, [])

  /**
   * Cleanup function for unmounting.
   */
  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    if (bpmCheckIntervalRef.current) {
      clearInterval(bpmCheckIntervalRef.current)
    }
  }, [])

  return {
    startBeat,
    stopBeat,
    cleanup,
    intervalRef,
    bpmCheckIntervalRef,
  }
}
