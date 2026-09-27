/**
 * Grid generation utilities
 * 
 * Functions for creating game grids based on difficulty and content pool.
 */

import type { GridItem, Difficulty } from './types'
import type { ContentPoolItem } from '@/components/ContentPoolManager'
import { DEFAULT_EMOJIS, GRID_SIZE } from './constants'

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Fisher-Yates shuffle algorithm for randomizing arrays.
 * Returns a new shuffled array without modifying the original.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// ============================================================================
// Grid Generation
// ============================================================================

/**
 * Generate a grid using random emojis from the default pool.
 * Used as fallback when no custom content is provided.
 */
export function generateRandomEmojiGrid(difficulty: Difficulty): GridItem[] {
  const shuffled = shuffleArray(DEFAULT_EMOJIS)
  const result: GridItem[] = []

  switch (difficulty) {
    case 'easy': {
      // Pairs of same emojis - easier to say the same word twice
      for (let i = 0; i < GRID_SIZE; i += 2) {
        const emoji = shuffled[i % shuffled.length]
        result.push({ content: emoji, type: 'emoji' })
        result.push({ content: emoji, type: 'emoji' })
      }
      break
    }
    
    case 'medium': {
      // Mostly different with occasional repeats (30% chance)
      let lastUsed: string | null = null
      for (let i = 0; i < GRID_SIZE; i++) {
        const available = lastUsed 
          ? shuffled.filter(e => e !== lastUsed)
          : shuffled
        const emoji = available[Math.floor(Math.random() * available.length)]
        result.push({ content: emoji, type: 'emoji' })
        lastUsed = Math.random() > 0.3 ? emoji : null
      }
      break
    }
    
    case 'hard': {
      // All different - no consecutive repeats
      for (let i = 0; i < GRID_SIZE; i++) {
        result.push({ content: shuffled[i % shuffled.length], type: 'emoji' })
      }
      break
    }
  }

  return result
}

/**
 * Generate a grid from a custom content pool.
 * Falls back to random emojis if pool is empty.
 * 
 * @param items - Custom content pool (images/emojis with optional words)
 * @param difficulty - Determines repeat patterns
 */
export function generateGridFromPool(
  items: ContentPoolItem[],
  difficulty: Difficulty,
  sequential?: boolean
): GridItem[] {
  if (items.length === 0) {
    return generateRandomEmojiGrid(difficulty)
  }

  if (sequential) {
    return items.map(item => ({ content: item.content, type: item.type, word: item.word }))
  }

  const result: GridItem[] = []

  switch (difficulty) {
    case 'easy': {
      // Pairs of same items
      for (let i = 0; i < GRID_SIZE; i += 2) {
        const randomItem = items[Math.floor(Math.random() * items.length)]
        result.push({ 
          content: randomItem.content, 
          type: randomItem.type, 
          word: randomItem.word 
        })
        result.push({ 
          content: randomItem.content, 
          type: randomItem.type, 
          word: randomItem.word 
        })
      }
      break
    }

    case 'medium': {
      // 30% chance to allow consecutive repeats
      let lastUsed: ContentPoolItem | null = null
      for (let i = 0; i < GRID_SIZE; i++) {
        const availableItems = lastUsed 
          ? items.filter(item => item.content !== lastUsed!.content)
          : items
        
        const pool = availableItems.length > 0 ? availableItems : items
        const randomItem = pool[Math.floor(Math.random() * pool.length)]
        
        result.push({ 
          content: randomItem.content, 
          type: randomItem.type, 
          word: randomItem.word 
        })
        
        // 70% chance to prevent next repeat
        lastUsed = Math.random() > 0.3 ? randomItem : null
      }
      break
    }

    case 'hard': {
      // Never repeat consecutive items
      let lastUsed: ContentPoolItem | null = null
      for (let i = 0; i < GRID_SIZE; i++) {
        const availableItems = lastUsed 
          ? items.filter(item => item.content !== lastUsed!.content)
          : items
        
        const pool = availableItems.length > 0 ? availableItems : items
        const randomItem = pool[Math.floor(Math.random() * pool.length)]
        
        result.push({ 
          content: randomItem.content, 
          type: randomItem.type, 
          word: randomItem.word 
        })
        lastUsed = randomItem
      }
      break
    }
  }

  return result
}
