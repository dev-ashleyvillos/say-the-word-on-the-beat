import { useRef, useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Heart, MusicNote, Play, Timer, PencilSimple, Check, X, SquaresFour, Trash, DotsThreeVertical } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { PublicShare } from '@/hooks/useLocalStorage'

interface GamePreviewCardProps {
  share: PublicShare
  onLike: (guid: string) => void
  onLoad: (guid: string) => void
  onRename?: (guid: string, title: string) => Promise<void>
  onDelete?: (guid: string) => Promise<void>
  isLiking?: boolean
  isRenaming?: boolean
  isDeleting?: boolean
}

/** Renders an image tile only after the card becomes visible in the scroll area. */
function LazyImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '100px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <img
      ref={ref}
      src={visible ? src : undefined}
      alt={alt}
      className={cn(className, !loaded && 'opacity-0', loaded && 'opacity-100 transition-opacity duration-200')}
      onLoad={() => setLoaded(true)}
    />
  )
}

async function handleShare(guid: string, title: string) {
  const url = `${window.location.origin}/share/${guid}`
  const shareTitle = title || 'Say the Word on Beat - Custom Game'
  const text = `Play "${shareTitle}" on Say the Word on Beat!`

  if (navigator.share) {
    try {
      await navigator.share({ title: shareTitle, text, url })
    } catch (err) {
      // User cancelled or browser denied — fall through to clipboard
      if ((err as DOMException).name !== 'AbortError') {
        await copyToClipboard(url)
      }
    }
  } else {
    await copyToClipboard(url)
  }
}

async function copyToClipboard(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Share link copied!')
  } catch {
    toast.error('Could not copy link')
  }
}

export function GamePreviewCard({ share, onLike, onLoad, onRename, onDelete, isLiking, isRenaming, isDeleting }: GamePreviewCardProps) {
  const { preview, title, likes, hasLiked, guid } = share

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(title)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.focus()
  }, [isEditingTitle])

  const startEditingTitle = () => {
    setDraftTitle(title)
    setIsEditingTitle(true)
  }

  const cancelEditingTitle = () => setIsEditingTitle(false)

  const confirmDelete = async () => {
    try {
      await onDelete?.(guid)
    } catch {
      // onDelete already surfaces a toast
    }
  }

  const saveTitle = async () => {
    const trimmed = draftTitle.trim()
    if (trimmed === (title || '')) {
      setIsEditingTitle(false)
      return
    }
    try {
      await onRename?.(guid, trimmed)
      setIsEditingTitle(false)
    } catch {
      // onRename already surfaces a toast; keep editing open so the user can retry
    }
  }

  // Get up to 4 content items for the preview grid
  const previewItems = preview?.contentItems?.slice(0, 4) || []

  // Format difficulty display
  const difficultyColors: Record<string, string> = {
    easy: 'bg-green-500/20 text-green-700 dark:text-green-400',
    medium: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    hard: 'bg-red-500/20 text-red-700 dark:text-red-400'
  }

  const formattedDate = new Date(share.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })

  return (
    <Card className="p-3 border-2 hover:border-primary/50 transition-colors group">
      {/* Title + Preview Row */}
      <div className="flex items-center gap-3 mb-2">
        {/* Mini Preview Grid - 4 tiles in a row */}
        <div className="flex gap-0.5 shrink-0">
          {[0, 1, 2, 3].map((index) => {
            const item = previewItems[index]
            return (
              <div
                key={index}
                className="w-10 h-10 flex items-center justify-center bg-muted/50 border border-border/50 rounded-sm overflow-hidden"
              >
                {item ? (
                  item.type === 'emoji' ? (
                    <span className="text-lg">{item.content}</span>
                  ) : (
                    <LazyImage
                      src={item.content}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )
                ) : (
                  <div className="w-full h-full bg-muted/30 rounded-sm" />
                )}
              </div>
            )
          })}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <div className="flex items-center gap-1">
              <Input
                ref={titleInputRef}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle()
                  if (e.key === 'Escape') cancelEditingTitle()
                }}
                maxLength={100}
                disabled={isRenaming}
                className="h-7 text-sm px-2"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" disabled={isRenaming} onClick={saveTitle}>
                <Check size={14} weight="bold" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" disabled={isRenaming} onClick={cancelEditingTitle}>
                <X size={14} weight="bold" />
              </Button>
            </div>
          ) : (
            <h3 className="font-semibold text-sm text-foreground line-clamp-1">
              {title || 'Untitled Game'}
            </h3>
          )}
          <span className="text-xs text-muted-foreground">{formattedDate}</span>
        </div>

        {!isEditingTitle && (onRename || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                title="More options"
              >
                <DotsThreeVertical size={18} weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onRename && (
                <DropdownMenuItem onSelect={startEditingTitle}>
                  <PencilSimple size={14} weight="bold" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => {
                    e.preventDefault()
                    setIsConfirmingDelete(true)
                  }}
                >
                  <Trash size={14} weight="bold" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Badge variant="secondary" className="text-xs gap-1">
          <SquaresFour size={12} weight="bold" />
          {preview?.totalItems ?? preview?.contentItems?.length ?? 0} tiles
        </Badge>
        <Badge variant="secondary" className="text-xs gap-1">
          <Timer size={12} weight="bold" />
          {preview?.rounds || 3} rounds
        </Badge>
        <Badge
          variant="secondary"
          className={cn('text-xs capitalize', difficultyColors[preview?.difficulty || 'medium'])}
        >
          {preview?.difficulty || 'medium'}
        </Badge>
        {preview?.hasCustomAudio && (
          <Badge variant="secondary" className="text-xs gap-1 bg-purple-500/20 text-purple-700 dark:text-purple-400">
            <MusicNote size={12} weight="fill" />
            Custom
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className={cn(
            'h-8 gap-1.5 flex-1',
            hasLiked && 'bg-red-500/10 border-red-500/50 text-red-600 hover:bg-red-500/20'
          )}
          onClick={() => onLike(guid)}
          disabled={isLiking}
        >
          <Heart
            size={16}
            weight={hasLiked ? 'fill' : 'regular'}
            className={hasLiked ? 'text-red-500' : ''}
          />
          <span className="font-medium">{likes}</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0 shrink-0"
          onClick={() => handleShare(guid, title)}
          title="Share this game"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 256 256"><path d="M212,200a36,36,0,1,1-69.85-12.25l-53-34.05a36,36,0,1,1,0-51.4l53-34a36.09,36.09,0,1,1,8.67,13.45l-53,34.05a36,36,0,0,1,0,24.5l53,34.05A36,36,0,0,1,212,200Z"></path></svg>
        </Button>

        <Button
          size="sm"
          className="h-8 gap-1.5 flex-1"
          onClick={() => onLoad(guid)}
        >
          <Play size={16} weight="fill" />
          Load
        </Button>
      </div>

      {onDelete && (
        <AlertDialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this round?</AlertDialogTitle>
              <AlertDialogDescription>
                "{title || 'Untitled Game'}" will be permanently deleted. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  )
}
