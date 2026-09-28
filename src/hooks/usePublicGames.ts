import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { shareApi, type PublicShare, type DifficultyFilter } from '@/hooks/useLocalStorage'

export type SortMode = 'popular' | 'newest'

interface UsePublicGamesOptions {
  pageSize?: number
}

export function usePublicGames({ pageSize = 12 }: UsePublicGamesOptions = {}) {
  const [shares, setShares] = useState<PublicShare[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [likingGuids, setLikingGuids] = useState<Set<string>>(new Set())
  const [renamingGuids, setRenamingGuids] = useState<Set<string>>(new Set())
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter | undefined>(undefined)
  const [pagination, setPagination] = useState({
    page: 1,
    hasMore: true,
    total: 0
  })

  const loadingRef = useRef(false)

  const fetchShares = useCallback(async (page: number, append: boolean, sort: SortMode, difficulty: DifficultyFilter | undefined) => {
    if (loadingRef.current) return
    loadingRef.current = true

    try {
      const response = await shareApi.getPublic(page, pageSize, sort, difficulty)

      setShares(prev => append ? [...prev, ...response.shares] : response.shares)
      setPagination({
        page: response.pagination.page,
        hasMore: response.pagination.hasMore,
        total: response.pagination.total
      })
    } catch (error) {
      console.error('Failed to fetch public games:', error)
      if (!append) {
        toast.error('Failed to load public games')
      }
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
      loadingRef.current = false
    }
  }, [pageSize])

  // Initial load
  useEffect(() => {
    fetchShares(1, false, sortMode, difficultyFilter)
  }, [fetchShares]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSortChange = useCallback((mode: SortMode) => {
    setSortMode(current => {
      if (mode === current) return current
      setIsLoading(true)
      setShares([])
      fetchShares(1, false, mode, difficultyFilter)
      return mode
    })
  }, [fetchShares, difficultyFilter])

  const handleDifficultyChange = useCallback((difficulty: DifficultyFilter | undefined) => {
    setDifficultyFilter(current => {
      if (difficulty === current) return current
      setIsLoading(true)
      setShares([])
      fetchShares(1, false, sortMode, difficulty)
      return difficulty
    })
  }, [fetchShares, sortMode])

  const handleLoadMore = useCallback(() => {
    if (!pagination.hasMore || isLoadingMore || loadingRef.current) return
    setIsLoadingMore(true)
    fetchShares(pagination.page + 1, true, sortMode, difficultyFilter)
  }, [pagination, isLoadingMore, fetchShares, sortMode, difficultyFilter])

  const handleLike = useCallback(async (guid: string) => {
    setLikingGuids(prev => {
      if (prev.has(guid)) return prev
      return new Set([...prev, guid])
    })

    try {
      const result = await shareApi.toggleLike(guid)

      setShares(prev => prev.map(share =>
        share.guid === guid
          ? { ...share, likes: result.likes, hasLiked: result.hasLiked }
          : share
      ))
    } catch (error) {
      toast.error('Failed to update like')
    } finally {
      setLikingGuids(prev => {
        const next = new Set(prev)
        next.delete(guid)
        return next
      })
    }
  }, [])

  const handleRename = useCallback(async (guid: string, title: string) => {
    setRenamingGuids(prev => new Set([...prev, guid]))

    try {
      const result = await shareApi.updateTitle(guid, title)

      setShares(prev => prev.map(share =>
        share.guid === guid ? { ...share, title: result.title } : share
      ))
    } catch (error) {
      toast.error('Failed to rename game')
      throw error
    } finally {
      setRenamingGuids(prev => {
        const next = new Set(prev)
        next.delete(guid)
        return next
      })
    }
  }, [])

  const handleRefresh = useCallback(() => {
    setIsLoading(true)
    setShares([])
    fetchShares(1, false, sortMode, difficultyFilter)
  }, [fetchShares, sortMode, difficultyFilter])

  return {
    shares,
    isLoading,
    isLoadingMore,
    likingGuids,
    renamingGuids,
    sortMode,
    difficultyFilter,
    pagination,
    fetchShares,
    handleSortChange,
    handleDifficultyChange,
    handleLoadMore,
    handleLike,
    handleRename,
    handleRefresh,
  }
}
