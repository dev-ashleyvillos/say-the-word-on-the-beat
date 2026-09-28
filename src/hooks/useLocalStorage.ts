import { useState, useEffect, useCallback, useRef } from 'react'

const API_BASE = '/api'

// Keys that should NOT be stored in localStorage (too large)
const SKIP_LOCAL_STORAGE_KEYS = ['custom-audio', 'image-pool-v2']

// Local storage expiration constants
const LAST_VISIT_KEY = 'last-visit-timestamp'
const EXPIRATION_DAYS = 7

// All setting keys used by the app (for reset functionality)
export const ALL_SETTING_KEYS = [
  'content-pool-v1',
  'difficulty',
  'sequential',
  'grid-items',
  'bpm-value',
  'base-bpm',
  'custom-audio',
  'bpm-analysis',
  'audio-start-time',
  'rounds',
  'increase-speed',
  'speed-increase-percent',
  'countdown-duration',
  'image-pool-v2' // Legacy key
]

/**
 * A share/config link is a self-contained snapshot: when one is present,
 * useShareConfig.loadFromUrl is the sole source of truth for these settings,
 * so per-key localStorage/session hydration below is skipped entirely to
 * avoid a race where a stale value (from a previous, unrelated visit on this
 * browser) overwrites what the link just loaded.
 */
function hasShareLinkParam(): boolean {
  try {
    const params = new URLSearchParams(window.location.search)
    return params.has('share') || params.has('config')
  } catch {
    return false
  }
}

/**
 * Check if localStorage has expired (user hasn't visited in 7 days)
 * and clear it if so. Updates the last visit timestamp.
 */
function checkAndClearExpiredStorage(): boolean {
  try {
    const lastVisit = localStorage.getItem(LAST_VISIT_KEY)
    const now = Date.now()
    
    if (lastVisit) {
      const lastVisitTime = parseInt(lastVisit, 10)
      const daysSinceVisit = (now - lastVisitTime) / (1000 * 60 * 60 * 24)
      
      if (daysSinceVisit >= EXPIRATION_DAYS) {
        console.log(`[Storage] Last visit was ${daysSinceVisit.toFixed(1)} days ago. Clearing expired data...`)
        
        // Clear all setting keys
        for (const key of ALL_SETTING_KEYS) {
          localStorage.removeItem(key)
        }
        
        // Update last visit to now
        localStorage.setItem(LAST_VISIT_KEY, now.toString())
        
        return true // Data was cleared
      }
    }
    
    // Update last visit timestamp
    localStorage.setItem(LAST_VISIT_KEY, now.toString())
    return false // Data was not cleared
  } catch (err) {
    console.warn('[Storage] Error checking expiration:', err)
    return false
  }
}

// Run expiration check once on module load
let hasCheckedExpiration = false
export function ensureStorageValid(): boolean {
  if (!hasCheckedExpiration) {
    hasCheckedExpiration = true
    return checkAndClearExpiredStorage()
  }
  return false
}

// Session management
let sessionPromise: Promise<void> | null = null

async function ensureSession(): Promise<void> {
  if (sessionPromise) return sessionPromise
  
  sessionPromise = (async () => {
    try {
      // Check if we already have a session
      const response = await fetch(`${API_BASE}/sessions/current`, {
        credentials: 'include'
      })
      
      if (response.ok) {
        return // Session exists
      }
      
      // Create new session
      await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        credentials: 'include'
      })
    } catch (err) {
      console.warn('Failed to establish session, using localStorage only:', err)
    }
  })()
  
  return sessionPromise
}

/**
 * Custom hook to replace useKV from GitHub Spark.
 * Uses localStorage for small data and API for large data (images, audio).
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T | undefined, (value: T) => void] {
  const skipLocalStorage = SKIP_LOCAL_STORAGE_KEYS.includes(key)
  
  // Initialize from localStorage (only for small data)
  const getStoredValue = useCallback((): T => {
    if (skipLocalStorage) return defaultValue
    // A link is about to overwrite this via loadFromUrl - start from the
    // default instead of flashing whatever this browser had saved before.
    if (hasShareLinkParam()) return defaultValue
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch {
      return defaultValue
    }
  }, [key, defaultValue, skipLocalStorage])

  const [value, setValue] = useState<T | undefined>(() => getStoredValue())
  const isInitialized = useRef(false)

  // Load from API on mount
  useEffect(() => {
    if (isInitialized.current) return
    isInitialized.current = true

    // Let loadFromUrl own these settings when a link is present - fetching
    // the old session here would race it and could clobber the link's values.
    if (hasShareLinkParam()) return

    const loadFromApi = async () => {
      try {
        await ensureSession()
        
        const response = await fetch(`${API_BASE}/settings/${encodeURIComponent(key)}`, {
          credentials: 'include'
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.value !== null && data.value !== undefined) {
            setValue(data.value)
            // Only cache in localStorage if not a large data key
            if (!skipLocalStorage) {
              try {
                localStorage.setItem(key, JSON.stringify(data.value))
              } catch {
                // Quota exceeded, skip localStorage
              }
            }
          }
        }
      } catch (err) {
        // API not available, use localStorage value
        console.debug(`Using localStorage for ${key}:`, err)
      }
    }

    loadFromApi()
  }, [key, skipLocalStorage])

  // Update function that saves to API (and localStorage for small data)
  const updateValue = useCallback((newValue: T) => {
    setValue(newValue)
    
    // Save to localStorage immediately (only for small data)
    if (!skipLocalStorage) {
      try {
        localStorage.setItem(key, JSON.stringify(newValue))
      } catch (err) {
        console.warn('Failed to save to localStorage (quota exceeded?):', err)
      }
    }

    // Sync to API in background
    const syncToApi = async () => {
      try {
        await ensureSession()
        
        await fetch(`${API_BASE}/settings/${encodeURIComponent(key)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ value: newValue })
        })
      } catch (err) {
        console.debug(`Failed to sync ${key} to API:`, err)
      }
    }

    syncToApi()
  }, [key, skipLocalStorage])

  return [value, updateValue]
}

/**
 * Reset all game settings to defaults
 */
export async function resetAllSettings(): Promise<void> {
  // Clear localStorage
  for (const key of ALL_SETTING_KEYS) {
    localStorage.removeItem(key)
  }
  
  // Clear from API
  try {
    await ensureSession()
    
    for (const key of ALL_SETTING_KEYS) {
      await fetch(`${API_BASE}/settings/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        credentials: 'include'
      }).catch(() => {})
    }
  } catch (err) {
    console.debug('Failed to clear settings from API:', err)
  }
}

// Types for public shares
export interface PublicSharePreview {
  contentItems: Array<{ content: string; type: 'emoji' | 'image' }>
  totalItems: number
  rounds: number
  bpm: number
  hasCustomAudio: boolean
  difficulty: string
  sequential: boolean
}

export type DifficultyFilter = 'easy' | 'medium' | 'hard' | 'fixedOrder'

export interface PublicShare {
  guid: string
  title: string
  likes: number
  preview: PublicSharePreview
  createdAt: string
  hasLiked: boolean
}

export interface PublicSharesResponse {
  shares: PublicShare[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}

/**
 * API client for share functionality
 */
export const shareApi = {
  async create(config: Record<string, unknown>, options?: { isPublic?: boolean; title?: string; _submit_time?: number }): Promise<string> {
    await ensureSession()
    
    const response = await fetch(`${API_BASE}/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        config,
        isPublic: options?.isPublic || false,
        title: options?.title || '',
        // Bot prevention: timing info
        _submit_time: options?._submit_time || Date.now()
      })
    })
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to create share')
    }
    
    const data = await response.json()
    return data.guid
  },

  async get(guid: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await fetch(`${API_BASE}/shares/${guid}`, {
        credentials: 'include'
      })
      
      if (!response.ok) {
        return null
      }
      
      const data = await response.json()
      return data.config
    } catch {
      return null
    }
  },

  async getPublic(page: number = 1, limit: number = 20, sort: 'popular' | 'newest' = 'newest', difficulty?: DifficultyFilter): Promise<PublicSharesResponse> {
    await ensureSession()

    const params = new URLSearchParams({ page: String(page), limit: String(limit), sort })
    if (difficulty) params.set('difficulty', difficulty)

    const response = await fetch(
      `${API_BASE}/shares/public?${params.toString()}`,
      { credentials: 'include' }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch public shares')
    }

    return response.json()
  },

  async updateTitle(guid: string, title: string): Promise<{ guid: string; title: string }> {
    const response = await fetch(`${API_BASE}/shares/${guid}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title })
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to rename share')
    }

    return response.json()
  },

  async toggleLike(guid: string): Promise<{ likes: number; hasLiked: boolean }> {
    await ensureSession()
    
    const response = await fetch(`${API_BASE}/shares/${guid}/like`, {
      method: 'POST',
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error('Failed to toggle like')
    }
    
    return response.json()
  }
}

/**
 * Helper to check if API is available
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`)
    return response.ok
  } catch {
    return false
  }
}
