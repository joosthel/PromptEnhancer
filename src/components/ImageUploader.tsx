'use client'

import { useState, useRef, useEffect, useCallback, DragEvent } from 'react'
import { ImageInput, fileToImageInput, extractImageFromClipboard, isValidImageUrl } from '@/lib/image-utils'
import { ImageLabel } from '@/lib/system-prompt'

const MAX_IMAGES = 10
const MAX_FILE_SIZE_MB = 10

const LABEL_PRESETS = ['style reference', 'subject', 'face', 'background', 'composition']

interface ImageUploaderProps {
  images: ImageInput[]
  imageLabels: ImageLabel[]
  maxImages?: number
  onChange: (images: ImageInput[]) => void
  onLabelsChange: (labels: ImageLabel[]) => void
}

export default function ImageUploader({ images, imageLabels, maxImages, onChange, onLabelsChange }: ImageUploaderProps) {
  const [dragging, setDragging] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState('')
  const [fileSizeError, setFileSizeError] = useState('')
  const [editingLabel, setEditingLabel] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const limit = maxImages ?? MAX_IMAGES

  const addImages = useCallback(
    async (files: File[]) => {
      const remaining = limit - images.length
      if (remaining <= 0) return

      const toProcess = files.slice(0, remaining)
      const results: ImageInput[] = []

      for (const file of toProcess) {
        if (!file.type.startsWith('image/')) continue
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          setFileSizeError(`${file.name} exceeds ${MAX_FILE_SIZE_MB}MB limit and was skipped.`)
          setTimeout(() => setFileSizeError(''), 5000)
          continue
        }
        const img = await fileToImageInput(file)
        results.push(img)
      }

      if (results.length > 0) {
        onChange([...images, ...results])
      }
    },
    [images, onChange, limit]
  )

  useEffect(() => {
    async function handlePaste(e: ClipboardEvent) {
      const file = extractImageFromClipboard(e)
      if (file) {
        await addImages([file])
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [addImages])

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    await addImages(files)
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    await addImages(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleAddUrl() {
    const url = urlInput.trim()
    setUrlError('')
    if (!url) return

    if (!isValidImageUrl(url)) {
      setUrlError('Please enter a valid URL')
      return
    }
    if (images.length >= limit) {
      setUrlError(`Maximum ${limit} images allowed`)
      return
    }

    const newImage: ImageInput = { type: 'url', url, preview: url }
    onChange([...images, newImage])
    setUrlInput('')
  }

  function removeImage(index: number) {
    onChange(images.filter((_, i) => i !== index))
    onLabelsChange(imageLabels
      .filter(l => l.index !== index)
      .map(l => l.index > index ? { ...l, index: l.index - 1 } : l)
    )
  }

  function setLabel(index: number, label: string) {
    const existing = imageLabels.filter(l => l.index !== index)
    if (label.trim()) {
      onLabelsChange([...existing, { index, label: label.trim() }])
    } else {
      onLabelsChange(existing)
    }
    setEditingLabel(null)
  }

  function getLabelForIndex(index: number): string {
    return imageLabels.find(l => l.index === index)?.label ?? ''
  }

  const atLimit = images.length >= limit

  return (
    <div className="space-y-3">
      <label className="block text-xs uppercase tracking-widest text-neutral-400">
        Reference Images
        <span className="ml-2 text-neutral-300 normal-case tracking-normal">
          ({images.length}/{limit})
        </span>
      </label>

      {!atLimit && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-sm px-4 py-6 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-neutral-400 bg-neutral-50'
              : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
          <p className="text-sm text-neutral-400">
            Drop images, click to browse, or paste
          </p>
          <p className="text-xs text-neutral-300 mt-1">
            PNG, JPG, WebP — max {MAX_FILE_SIZE_MB}MB each
          </p>
        </div>
      )}

      {fileSizeError && <p role="alert" className="text-xs text-red-500">{fileSizeError}</p>}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => {
            const label = getLabelForIndex(i)
            const isEditing = editingLabel === i

            return (
              <div key={i} className="relative group">
                <div
                  className="w-16 h-16 border border-neutral-200 rounded-sm overflow-hidden bg-neutral-100 cursor-pointer"
                  onClick={() => setEditingLabel(isEditing ? null : i)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.preview}
                    alt={`Reference ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Label badge */}
                {label && !isEditing && (
                  <div
                    className="absolute -bottom-1 left-0 right-0 text-center cursor-pointer"
                    onClick={() => setEditingLabel(i)}
                  >
                    <span className="text-[9px] px-1 py-0.5 bg-neutral-800 text-white rounded-sm truncate inline-block max-w-[64px]">
                      {label}
                    </span>
                  </div>
                )}
                {/* Label editor */}
                {isEditing && (
                  <div className="absolute top-full left-0 mt-1 z-10 bg-white border border-neutral-200 rounded-sm shadow-sm p-1.5 w-36">
                    <input
                      type="text"
                      defaultValue={label}
                      placeholder="Label this image..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setLabel(i, (e.target as HTMLInputElement).value)
                        if (e.key === 'Escape') setEditingLabel(null)
                      }}
                      onBlur={(e) => setLabel(i, e.target.value)}
                      className="w-full text-xs border border-neutral-200 rounded-sm px-1.5 py-1 focus:outline-none focus:border-neutral-400 mb-1"
                    />
                    <div className="flex flex-wrap gap-0.5">
                      {LABEL_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => setLabel(i, preset)}
                          className="text-[9px] px-1 py-0.5 bg-neutral-100 text-neutral-500 rounded-sm hover:bg-neutral-200 transition-colors"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Remove button */}
                <button
                  onClick={() => removeImage(i)}
                  aria-label="Remove image"
                  className="absolute -top-2 -right-2 w-5 h-5 min-w-[44px] min-h-[44px] rounded-full bg-neutral-800 text-white text-[10px] leading-none flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => {
            setUrlInput(e.target.value)
            setUrlError('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
          placeholder="https://... (image URL)"
          disabled={atLimit}
          className="flex-1 border border-neutral-200 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-neutral-400 placeholder:text-neutral-400 disabled:opacity-40"
        />
        <button
          onClick={handleAddUrl}
          disabled={!urlInput.trim() || atLimit}
          className="px-3 py-2 text-sm border border-neutral-200 rounded-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add URL
        </button>
      </div>
      {urlError && <p className="text-xs text-red-500">{urlError}</p>}
    </div>
  )
}
