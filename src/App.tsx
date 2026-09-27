/**
 * Say the Word on Beat - Main Application
 * 
 * A playful React app recreating the viral "Say the Word on Beat" challenge.
 * Users create picture grids, sync them to music beats, and share their games.
 * 
 * Architecture:
 * - State: useLocalStorage for persistence, useState for transient playback state
 * - Playback: useGamePlayback hook manages beat timing and audio sync
 * - Sharing: useShareConfig hook handles URL loading and share link generation
 * - UI: Separated into GameSettings, FullscreenPlayback, and FloatingMenu components
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import { useLocalStorage, resetAllSettings } from '@/hooks/useLocalStorage'
import { useDebouncedSlider } from '@/hooks/useDebouncedCallback'
import { useGamePlayback } from '@/hooks/useGamePlayback'
import { useShareConfig } from '@/hooks/useShareConfig'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { GameSettings } from '@/components/GameSettings'
import { FullscreenPlayback } from '@/components/FullscreenPlayback'
import { FloatingMenu } from '@/components/FloatingMenu'
import { PublicGamesPanel } from '@/components/PublicGamesPanel'
import { ShareModal } from '@/components/ShareModal'
import { AdminDashboard } from '@/components/AdminDashboard'
import { ConsentBanner } from '@/components/ConsentBanner'
import { PromoStrip } from '@/components/PromoStrip'
import { usePromo } from '@/hooks/usePromo'
import { usePromoEnabled } from '@/hooks/usePromoEnabled'
import { useAnyDialogOpen } from '@/hooks/useAnyDialogOpen'
import { usePrivacySettingsOpen } from '@/lib/use-consent.js'
import { openPrivacySettings } from '@/lib/consent.js'
import { FOOTER_COPY } from '@/lib/copy'

import { generateGridFromPool } from '@/lib/gridGenerator'
import { DEFAULT_CONTENT_POOL, DEFAULT_BPM } from '@/lib/constants'
import type { GridItem, Difficulty } from '@/lib/types'
import type { BpmAnalysisResult } from '@/lib/bpmAnalyzer'
import type { ContentPoolItem } from '@/components/ContentPoolManager'

// Audio assets
import defaultAudio from '@/assets/audio/audio.mp3'
import completeSound from '@/assets/audio/cheer.mp3'

// ============================================================================
// Main App Component
// ============================================================================

function App() {
  // Check for admin mode via URL param (?admin)
  const isAdminMode = new URLSearchParams(window.location.search).has('admin')

  if (isAdminMode) {
    return (
      <>
        <Toaster position="bottom-left" offset="24px" />
        <AdminDashboard />
      </>
    )
  }

  // ==========================================================================
  // Persistent State (survives page reload)
  // ==========================================================================
  
  const [contentPool, setContentPool] = useLocalStorage<ContentPoolItem[]>(
    'content-pool-v1', 
    DEFAULT_CONTENT_POOL
  )
  const [difficulty, setDifficulty] = useLocalStorage<Difficulty>('difficulty', 'medium')
  const [gridItems, setGridItems] = useLocalStorage<GridItem[]>('grid-items', [])
  const [bpm, setBpm] = useLocalStorage<number>('bpm-value', DEFAULT_BPM)
  const [baseBpm, setBaseBpm] = useLocalStorage<number>('base-bpm', DEFAULT_BPM)
  const [customAudio, setCustomAudio] = useLocalStorage<string | null>('custom-audio', null)
  const [bpmAnalysis, setBpmAnalysis] = useLocalStorage<BpmAnalysisResult | null>('bpm-analysis', null)
  const [audioStartTime, setAudioStartTime] = useLocalStorage<number>('audio-start-time', 0)
  const [rounds, setRounds] = useLocalStorage<number>('rounds', 5)
  const [increaseSpeed, setIncreaseSpeed] = useLocalStorage<boolean>('increase-speed', false)
  const [speedIncreasePercent, setSpeedIncreasePercent] = useLocalStorage<number>('speed-increase-percent', 5)
  const [countdownDuration, setCountdownDuration] = useLocalStorage<number>('countdown-duration', 2)

  // ==========================================================================
  // Transient State (resets on page reload)
  // ==========================================================================
  
  const [isPlaying, setIsPlaying] = useState(false)
  // Fixed-order playback (no UI toggle; only ever set by loading a share config)
  const [sequential, setSequential] = useState(false)
  const [communityRefreshKey, setCommunityRefreshKey] = useState(0)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set())
  const [currentRound, setCurrentRound] = useState(0)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [displayBpm, setDisplayBpm] = useState<number>(DEFAULT_BPM)
  const [isFinished, setIsFinished] = useState(false)
  const [isAppearancePhase, setIsAppearancePhase] = useState(false)

  // ==========================================================================
  // Audio Refs
  // ==========================================================================
  
  const customAudioRef = useRef<HTMLAudioElement | null>(null)
  const defaultAudioRef = useRef<HTMLAudioElement | null>(null)
  const completeSoundRef = useRef<HTMLAudioElement | null>(null)

  // ==========================================================================
  // Derived Values with Null-Safe Defaults
  // ==========================================================================
  
  const currentBpm = bpm ?? DEFAULT_BPM
  const currentBaseBpm = baseBpm ?? DEFAULT_BPM
  const currentDifficulty = difficulty ?? 'medium'
  const currentContentPool = contentPool ?? []
  const currentRounds = rounds ?? 5
  const currentIncreaseSpeed = increaseSpeed ?? false
  const currentSpeedIncreasePercent = speedIncreasePercent ?? 5
  const currentCountdownDuration = countdownDuration ?? 2
  const currentBpmAnalysis = bpmAnalysis ?? null
  const currentAudioStartTime = audioStartTime ?? 0

  // ==========================================================================
  // Debounced Slider Values (smooth UI with delayed persistence)
  // ==========================================================================
  
  const [localRounds, setLocalRounds] = useDebouncedSlider(currentRounds, setRounds, 500)
  const [localSpeedPercent, setLocalSpeedPercent] = useDebouncedSlider(currentSpeedIncreasePercent, setSpeedIncreasePercent, 500)
  const [localBpm, setLocalBpm] = useDebouncedSlider(currentBpm, setBpm, 500)
  const [localBaseBpm, setLocalBaseBpm] = useDebouncedSlider(currentBaseBpm, setBaseBpm, 500)
  const [localStartTime, setLocalStartTime] = useDebouncedSlider(currentAudioStartTime, setAudioStartTime, 500)
  const [localCountdown, setLocalCountdown] = useDebouncedSlider(currentCountdownDuration, setCountdownDuration, 500)

  // ==========================================================================
  // Grid Management
  // ==========================================================================
  
  // Fallback grid when no items are persisted
  const fallbackGridItems = useMemo(() => {
    return generateGridFromPool(currentContentPool, currentDifficulty, sequential)
  }, [currentContentPool, currentDifficulty, sequential])
  
  const displayedGridItems = (gridItems && gridItems.length > 0) ? gridItems : fallbackGridItems

  // ==========================================================================
  // Customization Detection (for share button validation)
  // ==========================================================================
  
  const hasCustomizations = useMemo(() => {
    const defaultContentStrings = DEFAULT_CONTENT_POOL.map(item => item.content).sort()
    const currentContentStrings = currentContentPool.map(item => item.content).sort()
    const contentPoolChanged = 
      currentContentPool.length !== DEFAULT_CONTENT_POOL.length ||
      currentContentStrings.some((content, i) => content !== defaultContentStrings[i]) ||
      currentContentPool.some(item => item.type === 'image')

    const hasCustomAudio = customAudio !== null
    const difficultyChanged = currentDifficulty !== 'medium'
    const bpmChanged = currentBpm !== DEFAULT_BPM
    const roundsChanged = currentRounds !== 5
    const speedSettingsChanged = currentIncreaseSpeed !== false

    return contentPoolChanged || hasCustomAudio || difficultyChanged || bpmChanged || roundsChanged || speedSettingsChanged
  }, [currentContentPool, customAudio, currentDifficulty, currentBpm, currentRounds, currentIncreaseSpeed])

  // ==========================================================================
  // Game Playback Hook
  // ==========================================================================
  
  const { startBeat, stopBeat, cleanup } = useGamePlayback({
    currentBpm,
    currentBaseBpm,
    currentRounds,
    currentDifficulty,
    currentSequential: sequential,
    currentContentPool,
    currentIncreaseSpeed,
    currentSpeedIncreasePercent,
    currentCountdownDuration,
    currentAudioStartTime,
    currentBpmAnalysis,
    customAudio: customAudio ?? null,
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
  })

  // ==========================================================================
  // Share Config Hook
  // ==========================================================================
  
  const { generateShareLink, loadFromUrl, loadPublicGame } = useShareConfig({
    currentBpm,
    currentBaseBpm,
    currentDifficulty,
    currentSequential: sequential,
    currentContentPool,
    customAudio: customAudio ?? null,
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
  })

  // ==========================================================================
  // Event Handlers
  // ==========================================================================
  
  const handlePlayPause = () => {
    if (isPlaying) {
      stopBeat()
    } else {
      startBeat()
    }
  }

  const handleAudioUpload = (url: string, analysis: BpmAnalysisResult | null) => {
    setCustomAudio(url)
    setBpmAnalysis(analysis)
    setAudioStartTime(0)
    if (analysis) {
      setBaseBpm(analysis.averageBpm)
      setBpm(analysis.averageBpm)
    }
  }

  const handleAudioRemove = () => {
    setCustomAudio(null)
    setBpmAnalysis(null)
    setBaseBpm(DEFAULT_BPM)
    setBpm(DEFAULT_BPM)
    setAudioStartTime(0)
  }

  const handleShareClick = () => {
    if (!hasCustomizations) {
      toast.info('Customize something to share')
      return
    }
    setShareModalOpen(true)
  }

  const handleResetClick = async () => {
    await resetAllSettings()
    toast.success('Game reset! Reloading...')
    setTimeout(() => window.location.reload(), 500)
  }

  // ==========================================================================
  // Effects
  // ==========================================================================
  
  // Load config from URL on mount
  useEffect(() => {
    loadFromUrl()
  }, [loadFromUrl])

  // Cleanup intervals on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  // Restart playback when BPM changes during play
  useEffect(() => {
    if (isPlaying) {
      stopBeat()
      startBeat()
    }
  }, [currentBpm])

  // Regenerate grid when difficulty, content, or sequential mode changes
  useEffect(() => {
    const newGrid = generateGridFromPool(currentContentPool, currentDifficulty, sequential)
    setGridItems(newGrid)
  }, [currentDifficulty, currentContentPool, sequential, setGridItems])

  // gameplayce.io#1348: Gameplayce promo. Shows on load, whenever nothing
  // else is on screen (rules: lib/promo.ts).
  const privacySettingsOpen = usePrivacySettingsOpen()
  const anyDialogOpen = useAnyDialogOpen()
  const promoEnabled = usePromoEnabled()
  const promo = usePromo({
    enabled: promoEnabled,
    blockers: {
      // The privacy settings panel (opt-out since 2026-09-26) is open.
      consentBannerVisible: privacySettingsOpen,
      playbackVisible: isFullscreen,
      dialogOpen: shareModalOpen || anyDialogOpen,
    },
  })

  // ==========================================================================
  // Render
  // ==========================================================================
  
  return (
    <div className="p-4 md:px-8 md:py-4">
      <Toaster position="bottom-left" offset="24px" />
      
      {/* Fullscreen Playback Overlay */}
      <FullscreenPlayback
        isVisible={isFullscreen}
        countdown={countdown}
        isFinished={isFinished}
        currentRound={currentRound}
        totalRounds={currentRounds}
        displayBpm={displayBpm}
        gridItems={displayedGridItems}
        activeIndex={activeIndex}
        revealedIndices={revealedIndices}
        isAppearancePhase={isAppearancePhase}
        onStop={stopBeat}
        onRestart={startBeat}
        onShare={() => { setIsFullscreen(false); handleShareClick() }}
      />
      
      {/* Main Content */}
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="text-center space-y-2 py-4">
          <h1 
            className="text-5xl md:text-7xl font-bold text-primary tracking-tight" 
            style={{ 
              textShadow: '0 2px 0 rgba(232, 116, 79, 0.2), 0 4px 12px rgba(232, 116, 79, 0.15)'
            }}
          >
            SAY THE WORD
          </h1>
          <p 
            className="text-3xl md:text-5xl font-semibold text-secondary" 
            style={{
              textShadow: '0 2px 8px rgba(91, 163, 208, 0.15)'
            }}
          >
            ON THE BEAT
          </p>
          <p className="text-sm text-muted-foreground">
            Build your own beat-synced word party game and share it with friends!
          </p>
        </header>

        {promo.visible && <PromoStrip onDismiss={promo.dismiss} onClick={promo.click} />}

        {/* Two-column Layout: Community Games + Game Editor */}
        <div className="flex flex-col xl:flex-row gap-6">
          {/* Community Games Sidebar (left on desktop, top on mobile) */}
          <div className="xl:w-[360px] shrink-0 xl:h-[calc(100vh-280px)] xl:sticky xl:top-8">
            <PublicGamesPanel onLoadGame={loadPublicGame} refreshKey={communityRefreshKey} />
          </div>

          {/* Game Editor */}
          <GameSettings
            contentPool={currentContentPool}
            onContentPoolChange={setContentPool}
            rounds={localRounds}
            onRoundsChange={setLocalRounds}
            difficulty={currentDifficulty}
            onDifficultyChange={setDifficulty}
            increaseSpeed={currentIncreaseSpeed}
            onIncreaseSpeedChange={setIncreaseSpeed}
            speedIncreasePercent={localSpeedPercent}
            onSpeedIncreasePercentChange={setLocalSpeedPercent}
            audioUrl={customAudio ?? null}
            onAudioUpload={handleAudioUpload}
            onAudioRemove={handleAudioRemove}
            bpm={localBpm}
            onBpmChange={setLocalBpm}
            baseBpm={localBaseBpm}
            onBaseBpmChange={setLocalBaseBpm}
            startTime={localStartTime}
            onStartTimeChange={setLocalStartTime}
            countdownDuration={localCountdown}
            onCountdownDurationChange={setLocalCountdown}
            isPlaying={isPlaying}
          />
        </div>

        {/* Footer */}
        <footer className="text-center text-sm text-muted-foreground space-y-2">
          <p>
            Made with ❤️ by ashleyvillos
            {' '}|{' '}
            <a
              href="https://github.com/dev-ashleyvillos/say-the-word-on-the-beat"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              🐙 GitHub
            </a>
          </p>
          <p data-testid="privacy-footer">
            <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">{FOOTER_COPY.privacy}</a>
            {' · '}
            <a href="/privacy#legal" className="underline underline-offset-2 hover:text-foreground">{FOOTER_COPY.legal}</a>
            {' · '}
            <button
              type="button"
              onClick={openPrivacySettings}
              className="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/60 rounded"
            >
              {FOOTER_COPY.settings}
            </button>
          </p>
        </footer>
      </div>

      {/* Audio Elements */}
      <audio ref={defaultAudioRef} src={defaultAudio} preload="auto" loop />
      <audio ref={completeSoundRef} src={completeSound} preload="auto" />
      {customAudio && (
        <audio ref={customAudioRef} src={customAudio} preload="auto" loop />
      )}

      {/* Share Modal */}
      <ShareModal
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        onGenerateShare={generateShareLink}
        hasContent={currentContentPool.length > 0}
        onPublicShare={() => setCommunityRefreshKey(k => k + 1)}
      />

      {/* Privacy settings: the analytics On/Off panel, opened from the footer */}
      <ConsentBanner suppressed={isFullscreen} />

      {/* Floating Action Menu */}
      {!isFullscreen && (
        <FloatingMenu
          isPlaying={isPlaying}
          hasCustomizations={hasCustomizations}
          onPlayPause={handlePlayPause}
          onShareClick={handleShareClick}
          onResetClick={handleResetClick}
        />
      )}
    </div>
  )
}

export default App
