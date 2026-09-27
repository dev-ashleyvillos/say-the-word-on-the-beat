import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlayCircle, PauseCircle, ShareNetwork, CaretDown, CaretUp, ArrowCounterClockwise } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface FloatingMenuProps {
  isPlaying: boolean
  hasCustomizations: boolean
  onPlayPause: () => void
  onShareClick: () => void
  onResetClick: () => void
}

export function FloatingMenu({ isPlaying, hasCustomizations, onPlayPause, onShareClick, onResetClick }: FloatingMenuProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="floating-menu fixed bottom-8 right-8 z-50 flex flex-col items-center gap-3">
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-3 bg-card border-2 border-border rounded-2xl p-3 shadow-2xl items-center"
          >
            <Button
              size="lg"
              className="h-[62px] w-[62px] rounded-xl shadow-lg text-base font-bold p-0 [&_svg]:!size-auto"
              onClick={onPlayPause}
            >
              {isPlaying ? (
                <PauseCircle size={54} weight="fill" />
              ) : (
                <PlayCircle size={54} weight="fill" />
              )}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className={`h-12 w-12 rounded-xl p-0 transition-opacity${!hasCustomizations ? ' opacity-40 cursor-not-allowed' : ''}`}
              onClick={onShareClick}
            >
              <ShareNetwork size={24} weight="fill" />
            </Button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 w-12 rounded-xl p-0"
                >
                  <ArrowCounterClockwise size={24} weight="bold" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Game?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will clear all your settings, uploaded images, custom audio, and return everything to default. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onResetClick}>
                    Reset Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        size="lg"
        variant="outline"
        className="h-12 w-12 rounded-xl p-0 bg-card border-2 shadow-lg"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <CaretDown size={24} weight="bold" />
        ) : (
          <CaretUp size={24} weight="bold" />
        )}
      </Button>
    </div>
  )
}
