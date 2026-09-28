import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ShareNetwork, Copy, Check, Globe } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface ShareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerateShare: (options: { isPublic: boolean; title: string; _hp_field?: string; _submit_time?: number }) => Promise<string>
  hasContent: boolean
}

// No accounts yet, so there's no private/personal library to keep a share out of —
// every share is public until Firebase/Auth0 login lands. See temp_docs/docs/02-features-to-implement.md.
export function ShareModal({ open, onOpenChange, onGenerateShare, hasContent }: ShareModalProps) {
  const [copied, setCopied] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [title, setTitle] = useState('')
  // Honeypot field - should remain empty, bots will fill it
  const [honeypot, setHoneypot] = useState('')
  // Track when dialog opened for timing validation
  const openedAtRef = useRef<number>(0)

  // Record when dialog opens
  useEffect(() => {
    if (open) {
      openedAtRef.current = Date.now()
    }
  }, [open])

  const handleGenerate = async () => {
    // Check honeypot - if filled, likely a bot
    if (honeypot) {
      // Silently fail for bots
      console.log('[Bot Detection] Honeypot triggered on client')
      toast.success('Share link generated!')
      return
    }

    setIsGenerating(true)
    try {
      const url = await onGenerateShare({
        isPublic: true,
        title: title.trim(),
        // Pass timing info to server for validation
        _submit_time: openedAtRef.current
      })
      setShareUrl(url)
      toast.success('Game shared publicly!')
    } catch (error) {
      if (error instanceof Error && error.message.includes('wait')) {
        toast.error(error.message)
      } else {
        toast.error('Failed to generate share link')
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('Share link copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error('Failed to copy link')
    }
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      // Reset state when closing
      setShareUrl('')
      setTitle('')
      setHoneypot('')
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <ShareNetwork size={28} weight="bold" className="text-primary" />
            Share Your Game
          </DialogTitle>
          <DialogDescription>
            Generate a shareable link — everyone can discover it in Community Games
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {!shareUrl ? (
            <>
              {/* Honeypot field - hidden from humans, visible to bots */}
              <div className="absolute -left-[9999px] opacity-0 pointer-events-none" aria-hidden="true">
                <label htmlFor="website-url">Leave this field empty</label>
                <input
                  type="text"
                  id="website-url"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              {/* Title input */}
              <div className="space-y-2">
                <Label htmlFor="share-title">Game Title (optional)</Label>
                <Input
                  id="share-title"
                  placeholder="Give your game a fun name..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                />
              </div>
              
              {/* No accounts yet, so every share is public for now */}
              <div className={`flex items-center gap-3 p-3 rounded-lg border-2 bg-muted/30 ${!hasContent ? 'opacity-60' : ''}`}>
                <Globe size={18} weight="bold" className="text-primary shrink-0" />
                <p className="text-xs text-muted-foreground">
                  {hasContent
                    ? "Anyone will be able to discover and play this game in Community Games."
                    : 'Add at least one image or emoji to share this game.'}
                </p>
              </div>

              <Button
                size="lg"
                onClick={handleGenerate}
                disabled={isGenerating || !hasContent}
                className="w-full"
              >
                <Globe size={20} weight="bold" />
                {isGenerating ? 'Generating...' : 'Share with Community'}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Globe size={16} weight="bold" className="text-green-500" />
                  Shared Publicly
                </label>
                <div className="flex gap-2">
                  <Input
                    value={shareUrl}
                    readOnly
                    className="flex-1"
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <Check size={18} weight="bold" />
                    ) : (
                      <Copy size={18} weight="bold" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  ✨ Your game is now visible in the Community Games section
                </p>
              </div>
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShareUrl('')}
                className="w-full"
              >
                Create Another Share
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
