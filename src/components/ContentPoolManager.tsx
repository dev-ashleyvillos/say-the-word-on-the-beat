import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Upload, X, Plus, Pencil, Smiley, ImageSquare, Trash } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { validateImageFile, sanitizeText } from '@/lib/security'
import { ImageCropper } from '@/components/ImageCropper'
import { MAX_CONTENT_ITEMS, GRID_SIZE } from '@/lib/constants'

export interface ContentPoolItem {
  content: string
  type: 'emoji' | 'image'
  word?: string
}

interface ContentPoolManagerProps {
  items: ContentPoolItem[]
  onItemsChange: (items: ContentPoolItem[]) => void
}

const EMOJI_CATEGORIES = {
  'Animals': ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋'],
  'Food': ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🍞'],
  'Objects': ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⏰'],
  'Things': ['⌚', '📱', '💻', '🖥️', '📷', '📺', '📻', '🎙️', '🧭', '⏱️', '🔔', '🧱', '🕐', '🪨', '🎸', '🎹', '🥁', '🎺', '🎻', '🪗', '🎤', '🎧', '📚', '✏️', '🔑', '🔒', '💡', '🔦', '🧲', '🪜'],
  'Nature': ['🌸', '🌺', '🌻', '🌹', '🌷', '🌼', '🌵', '🌲', '🌳', '🌴', '🍀', '🍁', '🍂', '🍃', '🌾', '🌿', '☘️', '🪴', '🌱', '🪵', '🍄', '🐚', '🪸', '🪨', '🌍', '🌙', '⭐', '☀️', '🌈', '❄️'],
  'Smileys': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😎', '🥸', '🤩', '🥳', '😤', '😠', '🤯', '😱', '🥶', '🥵', '😴', '🤤', '😈', '👻', '🤖', '👽'],
}

export function ContentPoolManager({ items, onItemsChange }: ContentPoolManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingWord, setEditingWord] = useState('')
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  
  // Cropping state
  const [cropperOpen, setCropperOpen] = useState(false)
  const [imageToCrop, setImageToCrop] = useState<string | null>(null)
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [currentCropIndex, setCurrentCropIndex] = useState(0)

  const handleAddEmoji = (emoji: string) => {
    if (items.length >= MAX_CONTENT_ITEMS) {
      toast.error(`Maximum ${MAX_CONTENT_ITEMS} items allowed`)
      return
    }
    onItemsChange([...items, { content: emoji, type: 'emoji' }])
    setIsPickerOpen(false)
    toast.success('Emoji added!')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const remainingSlots = MAX_CONTENT_ITEMS - items.length
    if (files.length > remainingSlots) {
      toast.error(`You can only add ${remainingSlots} more item${remainingSlots === 1 ? '' : 's'}`)
      return
    }

    const validationPromises = files.map(async file => {
      const validation = await validateImageFile(file)
      return { file, validation }
    })

    const validationResults = await Promise.all(validationPromises)
    const validFiles = validationResults.filter(result => {
      if (!result.validation.valid) {
        toast.error(`${result.file.name}: ${result.validation.error}`)
        return false
      }
      return true
    }).map(result => result.file)

    if (validFiles.length === 0) return

    // Read all files and queue them for cropping
    const readPromises = validFiles.map(file => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (event) => {
          resolve(event.target?.result as string)
        }
        reader.onerror = () => {
          reject(new Error(`Failed to read ${file.name}`))
        }
        reader.readAsDataURL(file)
      })
    })

    try {
      const imageDataUrls = await Promise.all(readPromises)
      // Queue images for cropping
      setPendingImages(imageDataUrls)
      setCurrentCropIndex(0)
      setImageToCrop(imageDataUrls[0])
      setCropperOpen(true)
      setIsPickerOpen(false)
    } catch (error) {
      toast.error('Failed to read some images')
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCropComplete = (croppedImageDataUrl: string) => {
    // Add the cropped image to items
    onItemsChange([...items, { content: croppedImageDataUrl, type: 'image' }])
    
    // Move to next image or finish
    const nextIndex = currentCropIndex + 1
    if (nextIndex < pendingImages.length) {
      setCurrentCropIndex(nextIndex)
      setImageToCrop(pendingImages[nextIndex])
      // Keep cropper open for next image
    } else {
      // All images processed
      setCropperOpen(false)
      setImageToCrop(null)
      setPendingImages([])
      setCurrentCropIndex(0)
      toast.success(`${pendingImages.length} image${pendingImages.length === 1 ? '' : 's'} added!`)
    }
  }

  const handleCropCancel = () => {
    // Skip current image and move to next, or close if last
    const nextIndex = currentCropIndex + 1
    if (nextIndex < pendingImages.length) {
      setCurrentCropIndex(nextIndex)
      setImageToCrop(pendingImages[nextIndex])
    } else {
      setCropperOpen(false)
      setImageToCrop(null)
      setPendingImages([])
      setCurrentCropIndex(0)
      if (currentCropIndex > 0) {
        toast.success('Images added!')
      }
    }
  }

  const handleRemoveItem = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index))
    toast.success('Item removed')
  }

  const handleEditWord = (index: number) => {
    setEditingIndex(index)
    setEditingWord(items[index].word || '')
  }

  const handleSaveWord = (index: number) => {
    const sanitizedWord = sanitizeText(editingWord.trim())
    const updatedItems = [...items]
    updatedItems[index] = { 
      ...updatedItems[index], 
      word: sanitizedWord || undefined 
    }
    onItemsChange(updatedItems)
    setEditingIndex(null)
    setEditingWord('')
    toast.success(sanitizedWord ? 'Word saved' : 'Word removed')
  }

  return (
    <>
      <Card className="p-4 border-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smiley size={20} weight="bold" className="text-secondary" />
              <label className="text-sm font-semibold text-foreground">
                Content Pool
              </label>
            </div>
            <Badge variant="secondary" className="text-xs">
              {items.length}/{MAX_CONTENT_ITEMS}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            Add emojis or images (up to {MAX_CONTENT_ITEMS}). Optionally add custom words that display with each item.
          </p>

          {items.length > GRID_SIZE && items.length % GRID_SIZE !== 0 && (
            <p className="text-xs text-destructive">
              Fixed Order needs a multiple of {GRID_SIZE} items — add {GRID_SIZE - (items.length % GRID_SIZE)} more or remove {items.length % GRID_SIZE}.
            </p>
          )}

          {items.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {items.map((item, index) => (
                <div key={index} className="space-y-1">
                  <div className="relative aspect-square">
                    {item.type === 'emoji' ? (
                      <div className="w-full h-full flex items-center justify-center bg-muted rounded-md border-2 border-border">
                        <span className="text-3xl select-none">{item.content}</span>
                      </div>
                    ) : (
                      <img
                        src={item.content}
                        alt={`Pool item ${index + 1}`}
                        className="w-full h-full object-cover rounded-md border-2 border-border"
                      />
                    )}
                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:scale-110 active:scale-95 shadow-md z-10"
                    >
                      <X size={12} weight="bold" />
                    </button>
                    {item.word && (
                      <div className="absolute bottom-1 left-1 right-1 bg-black/75 text-white text-[10px] font-bold py-0.5 px-1 rounded text-center truncate">
                        {item.word}
                      </div>
                    )}
                  </div>
                  
                  {editingIndex === index ? (
                    <div className="flex gap-1">
                      <Input
                        value={editingWord}
                        onChange={(e) => setEditingWord(e.target.value)}
                        placeholder="Word"
                        className="text-xs h-7 px-2"
                        maxLength={20}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveWord(index)
                          } else if (e.key === 'Escape') {
                            setEditingIndex(null)
                            setEditingWord('')
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSaveWord(index)}
                        className="h-7 px-2 text-xs"
                      >
                        ✓
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditWord(index)}
                      className="w-full h-7 text-xs gap-1 px-2"
                    >
                      <Pencil size={12} weight="bold" />
                      {item.word ? 'Edit' : 'Word'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsPickerOpen(true)}
              className="flex-1 gap-2"
              disabled={items.length >= MAX_CONTENT_ITEMS}
            >
              <Plus size={16} weight="bold" />
              {items.length === 0 ? 'Add Emoji or Image' : `Add More (${MAX_CONTENT_ITEMS - items.length} slots)`}
            </Button>
            {items.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onItemsChange([])
                  toast.success('All items removed')
                }}
                className="gap-1 text-destructive hover:text-destructive"
              >
                <Trash size={16} weight="bold" />
                Clear
              </Button>
            )}
          </div>
          
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center">
              🎲 With no content, random emojis will be used!
            </p>
          )}
        </div>
      </Card>

      <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Add Content</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="emoji" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="emoji" className="gap-2">
                <Smiley size={20} weight="bold" />
                Emoji
              </TabsTrigger>
              <TabsTrigger value="image" className="gap-2">
                <ImageSquare size={20} weight="bold" />
                Image
              </TabsTrigger>
            </TabsList>

            <TabsContent value="emoji" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-6">
                  {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
                    <div key={category}>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                        {category}
                      </h3>
                      <div className="grid grid-cols-6 gap-2">
                        {emojis.map((emoji, i) => (
                          <button
                            key={`${emoji}-${i}`}
                            onClick={() => handleAddEmoji(emoji)}
                            className="aspect-square flex items-center justify-center text-3xl hover:bg-accent rounded-lg transition-colors cursor-pointer border-2 border-transparent hover:border-primary bg-muted/50"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="image" className="mt-4">
              <div className="flex flex-col items-center justify-center h-[400px] gap-4">
                <ImageSquare size={64} weight="thin" className="text-muted-foreground" />
                <p className="text-muted-foreground text-center">
                  Upload images from your device
                </p>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload size={20} weight="bold" />
                  Choose Images
                </Button>
                <p className="text-xs text-muted-foreground">
                  Max 5MB per image • JPG, PNG, GIF, WebP
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
        </DialogContent>
      </Dialog>

      {imageToCrop && (
        <ImageCropper
          open={cropperOpen}
          onOpenChange={(open) => {
            if (!open) {
              handleCropCancel()
            }
          }}
          imageSrc={imageToCrop}
          onCropComplete={handleCropComplete}
          aspectRatio={1}
        />
      )}
      
      {/* Show progress when cropping multiple images */}
      {cropperOpen && pendingImages.length > 1 && (
        <div className="fixed bottom-4 right-4 z-[200] bg-background/95 backdrop-blur border-2 border-border rounded-lg px-4 py-2 shadow-lg">
          <p className="text-sm font-medium">
            Image {currentCropIndex + 1} of {pendingImages.length}
          </p>
        </div>
      )}
    </>
  )
}
