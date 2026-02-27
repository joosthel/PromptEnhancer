/**
 * @file ImageUploader.tsx
 * Reference image input panel. Accepts images via drag-and-drop, file picker,
 * global clipboard paste (Cmd/Ctrl+V), and direct URL entry.
 *
 * Uploaded files are resized and compressed client-side via {@link fileToImageInput}
 * before being stored as {@link ImageInput} values. A maximum of 5 images is enforced.
 *
 * Props:
 *   - images: current list of reference images
 *   - onChange: callback to update the image list in the parent
 */
'use client'

import { useState, useRef, useEffect, useCallback, DragEvent } from 'react'
import { ImageInput, fileToImageInput, extractImageFromClipboard, isValidImageUrl } from '@/lib/image-utils'

const MAX_IMAGES = 5
const MAX_FILE_SIZE_MB = 10

interface ImageUploaderProps {
  images: ImageInput[]
  onChange: (images: ImageInput[]) => void
}

export default function ImageUploader({ images, onChange }: ImageUploaderProps) {
  const [dragging, setDragging] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addImages = useCallback(
    async (files: File[]) => {
      const remaining = MAX_IMAGES - images.length
      if (remaining <= 0) return

      const toProcess = files.slice(0, remaining)
      const results: ImageInput[] = []

      for (const file of toProcess) {
        if (!file.type.startsWith('image/')) continue
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          alert(`${file.name} exceeds ${MAX_FILE_SIZE_MB}MB limit and was skipped.`)
          continue
        }
        const img = await fileToImageInput(file)
        results.push(img)
      }

      if (results.length > 0) {
        onChange([...images, ...results])
      }
    },
    [images, onChange]
  )

  // Global paste handler
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
    if (images.length >= MAX_IMAGES) {
      setUrlError(`Maximum ${MAX_IMAGES} images allowed`)
      return
    }

    const newImage: ImageInput = { type: 'url', url, preview: url }
    onChange([...images, newImage])
    setUrlInput('')
  }

  function removeImage(index: number) {
    onChange(images.filter((_, i) => i !== index))
  }

  const atLimit = images.length >= MAX_IMAGES

  return (
    <div className="space-y-3">
      <label className="block text-xs uppercase tracking-widest text-neutral-400">
        Reference Images
        <span className="ml-2 text-neutral-300 normal-case tracking-normal">
          ({images.length}/{MAX_IMAGES})
        </span>
      </label>

      {!atLimit && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-sm px-4 py-8 text-center cursor-pointer transition-colors ${
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
            Drop images here, click to browse, or paste from clipboard
          </p>
          <p className="text-xs text-neutral-300 mt-1">
            PNG, JPG, WebP — max {MAX_FILE_SIZE_MB}MB each
          </p>
        </div>
      )}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <div className="w-16 h-16 border border-neutral-200 rounded-sm overflow-hidden bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.preview}
                  alt={`Reference ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-neutral-800 text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
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
          className="flex-1 border border-neutral-200 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-neutral-400 placeholder:text-neutral-300 disabled:opacity-40"
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
