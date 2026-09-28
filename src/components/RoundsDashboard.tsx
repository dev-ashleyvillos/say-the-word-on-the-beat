import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, ArrowClockwise, Trophy, TrendUp, ClockCounterClockwise, MagnifyingGlass } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { usePublicGames } from '@/hooks/usePublicGames'
import { GamePreviewCard } from '@/components/GamePreviewCard'
import type { DifficultyFilter } from '@/hooks/useLocalStorage'

interface RoundsDashboardProps {
  onLoadGame: (guid: string) => Promise<void>
  onClose: () => void
}

const DIFFICULTY_FILTERS: { label: string; value: DifficultyFilter | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Easy', value: 'easy' },
  { label: 'Medium', value: 'medium' },
  { label: 'Hard', value: 'hard' },
  { label: 'Fixed Order', value: 'fixedOrder' },
]

export function RoundsDashboard({ onLoadGame, onClose }: RoundsDashboardProps) {
  const {
    shares,
    isLoading,
    isLoadingMore,
    likingGuids,
    renamingGuids,
    sortMode,
    difficultyFilter,
    pagination,
    handleSortChange,
    handleDifficultyChange,
    handleLoadMore,
    handleLike,
    handleRename,
    handleRefresh,
  } = usePublicGames({ pageSize: 24 })

  const [query, setQuery] = useState('')

  const filteredShares = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return shares
    return shares.filter(share => (share.title || 'untitled game').toLowerCase().includes(q))
  }, [shares, query])

  const handleLoad = async (guid: string) => {
    try {
      await onLoadGame(guid)
      toast.success('Game loaded!')
      onClose()
    } catch (error) {
      toast.error('Failed to load game')
    }
  }

  return (
    <Card className="p-4 md:p-6 border-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} className="h-8 gap-1.5 px-2">
            <Plus size={16} weight="bold" />
            Create Your Own
          </Button>
          <h2 className="font-bold text-xl">Browse Rounds</h2>
          {pagination.total > 0 && (
            <span className="text-xs text-muted-foreground">({pagination.total})</span>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={isLoading} className="h-8 w-8 p-0">
          <ArrowClockwise size={16} weight="bold" className={isLoading ? 'animate-spin' : ''} />
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Every round anyone has made public, saved in the database — no account needed.
      </p>

      {/* Controls */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title..."
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={sortMode === 'popular' ? 'secondary' : 'ghost'}
            className="h-9 gap-1.5 text-xs px-2.5"
            onClick={() => handleSortChange('popular')}
          >
            <TrendUp size={13} weight="bold" />
            Popular
          </Button>
          <Button
            size="sm"
            variant={sortMode === 'newest' ? 'secondary' : 'ghost'}
            className="h-9 gap-1.5 text-xs px-2.5"
            onClick={() => handleSortChange('newest')}
          >
            <ClockCounterClockwise size={13} weight="bold" />
            Newest
          </Button>
        </div>
      </div>

      {/* Difficulty filter */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {DIFFICULTY_FILTERS.map(({ label, value }) => (
          <Button
            key={label}
            size="sm"
            variant={difficultyFilter === value ? 'secondary' : 'outline'}
            className="h-7 text-xs px-3"
            onClick={() => handleDifficultyChange(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="p-3 border-2">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex gap-0.5 shrink-0">
                  {[0, 1, 2, 3].map(j => (
                    <Skeleton key={j} className="w-10 h-10 rounded-sm" />
                  ))}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <div className="flex gap-2 mb-3">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 flex-1 rounded-md" />
                <Skeleton className="h-8 flex-1 rounded-md" />
              </div>
            </Card>
          ))}
        </div>
      ) : filteredShares.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Trophy size={48} weight="duotone" className="text-muted-foreground/50 mb-3" />
          <h3 className="font-semibold text-foreground mb-1">
            {shares.length === 0 && !difficultyFilter ? 'No Public Rounds Yet' : 'No Matches'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-[280px]">
            {shares.length === 0 && !difficultyFilter
              ? 'Be the first to share your game with the community!'
              : query
                ? `Nothing on this page matches "${query}".`
                : 'No rounds match this filter yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredShares.map((share) => (
              <GamePreviewCard
                key={share.guid}
                share={share}
                onLike={handleLike}
                onLoad={handleLoad}
                onRename={handleRename}
                isLiking={likingGuids.has(share.guid)}
                isRenaming={renamingGuids.has(share.guid)}
              />
            ))}
          </div>

          {isLoadingMore && (
            <div className="flex items-center justify-center py-4">
              <ArrowClockwise size={20} weight="bold" className="animate-spin text-muted-foreground" />
            </div>
          )}

          {pagination.hasMore && !isLoadingMore && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" className="h-11 px-6" onClick={handleLoadMore}>
                Load more rounds
              </Button>
            </div>
          )}

          {!pagination.hasMore && shares.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">
              You've seen all {pagination.total} rounds!
            </p>
          )}
        </>
      )}
    </Card>
  )
}
