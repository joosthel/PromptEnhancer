export type ImageInput =
  | { type: 'base64'; data: string; mimeType: string; preview: string }
  | { type: 'url'; url: string; preview: string }

const MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.85

// Resize and compress an image file via canvas, then return as ImageInput
export async function fileToImageInput(file: File): Promise<ImageInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img

        // Scale down if needed
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width >= height) {
            height = Math.round((height * MAX_DIMENSION) / width)
            width = MAX_DIMENSION
          } else {
            width = Math.round((width * MAX_DIMENSION) / height)
            height = MAX_DIMENSION
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)

        const compressed = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
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

export function isValidImageUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
