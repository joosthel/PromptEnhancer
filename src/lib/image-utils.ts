/**
 * @file image-utils.ts
 * Client-side image helpers used by the ImageUploader component.
 * Handles canvas-based resizing/compression, clipboard extraction, and URL validation.
 * All functions run in the browser — none are safe to call in a Node/server context.
 */

/**
 * Discriminated union representing a reference image ready for API submission.
 * - `base64` — a locally uploaded file, compressed and encoded as a JPEG data URL.
 * - `url`    — a remote image URL provided by the user; sent as-is to the model.
 *
 * Both variants carry a `preview` string suitable for `<img src>` display.
 */
export type ImageInput =
  | { type: 'base64'; data: string; mimeType: string; preview: string }
  | { type: 'url'; url: string; preview: string }

const MAX_OUTPUT_BASE64_CHARS = 1_400_000

// Ordered fallbacks: lower quality first at full resolution, then downscale.
const COMPRESSION_ATTEMPTS: Array<readonly [dim: number, quality: number]> = [
  [1920, 0.85],
  [1920, 0.75],
  [1920, 0.65],
  [1920, 0.55],
  [1600, 0.75],
  [1280, 0.75],
]

function resizeAndEncode(img: HTMLImageElement, maxDim: number, quality: number): string {
  let { width, height } = img
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width)
      width = maxDim
    } else {
      width = Math.round((width * maxDim) / height)
      height = maxDim
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Reads a File, resizes to at most 1920px on the longest side, and compresses
 * to JPEG. If the encoded base64 exceeds {@link MAX_OUTPUT_BASE64_CHARS}, walks
 * down quality and dimension until it fits. Uses an off-screen canvas —
 * browser-only, not SSR-safe.
 */
export async function fileToImageInput(file: File): Promise<ImageInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => {
        let compressed = ''
        for (const [dim, quality] of COMPRESSION_ATTEMPTS) {
          compressed = resizeAndEncode(img, dim, quality)
          if (compressed.length <= MAX_OUTPUT_BASE64_CHARS) break
        }
        const [prefix, data] = compressed.split(',')
        const mimeType = prefix.split(':')[1].split(';')[0]
        resolve({ type: 'base64', data, mimeType, preview: compressed })
      }
      img.onerror = reject
      img.src = dataUrl
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Extracts the first image file from a {@link ClipboardEvent}.
 * Returns `null` if the clipboard contains no image items.
 */
export function extractImageFromClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items
  if (!items) return null
  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      return item.getAsFile()
    }
  }
  return null
}

/**
 * Returns `true` if {@link url} is a parseable absolute URL, `false` otherwise.
 * Used to validate user-pasted URLs before adding them to the image list.
 */
export function isValidImageUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Computes a stable fingerprint for a set of images.
 * Used to detect when images have changed so vision analysis cache can be invalidated.
 * Deliberately lightweight — avoids cryptographic hashing since we only need equality.
 */
export function computeImageFingerprint(images: ImageInput[]): string {
  const parts = images.map((img) => {
    if (img.type === 'base64') {
      return `b64:${img.data.length}:${img.data.slice(0, 32)}`
    }
    return `url:${img.url}`
  })
  return parts.join('|')
}
