'use client'

import { useState, useCallback } from 'react'
import ApiKeyInput from '@/components/ApiKeyInput'
import ImageUploader from '@/components/ImageUploader'
import InputForm from '@/components/InputForm'
import PromptList from '@/components/PromptList'
import { ImageInput } from '@/lib/image-utils'
import { UserInputs, VisualStyleCues } from '@/lib/system-prompt'

interface GenerateResult {
  prompts: Array<{ label: string; prompt: string }>
  visualStyleCues?: VisualStyleCues
}

type LoadingPhase = 'idle' | 'analyzing' | 'generating' | 'done'

const DEFAULT_INPUTS: UserInputs = {
  storyline: '',
  subject: '',
  environment: '',
  mood: '',
}

export default function Home() {
  const [apiKey, setApiKey] = useState('')
  const [images, setImages] = useState<ImageInput[]>([])
  const [userInputs, setUserInputs] = useState<UserInputs>(DEFAULT_INPUTS)
  const [promptCount, setPromptCount] = useState(4)
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('idle')
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleKeyChange = useCallback((key: string) => {
    setApiKey(key)
  }, [])

  async function handleGenerate() {
    if (!apiKey.trim()) {
      setError('Please save your OpenRouter API key first.')
      return
    }

    const hasImages = images.length > 0
    const hasInputs = Object.values(userInputs).some((v) => v.trim())

    if (!hasImages && !hasInputs) {
      setError('Add reference images or describe your concept to get started.')
      return
    }

    setError(null)
    setResult(null)
    setLoadingPhase(hasImages ? 'analyzing' : 'generating')

    let phaseTimer: ReturnType<typeof setTimeout> | null = null
    if (hasImages) {
      phaseTimer = setTimeout(() => setLoadingPhase('generating'), 7000)
    }

    try {
      const serializedImages = images.map((img) => {
        if (img.type === 'base64') {
          return { type: 'base64' as const, data: img.data, mimeType: img.mimeType }
        }
        return { type: 'url' as const, url: img.url }
      })

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          images: serializedImages,
          userInputs,
          promptCount,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? `Request failed with status ${response.status}`)
      }

      setResult(data as GenerateResult)
      setLoadingPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      setLoadingPhase('idle')
    } finally {
      if (phaseTimer) clearTimeout(phaseTimer)
    }
  }

  const isLoading = loadingPhase === 'analyzing' || loadingPhase === 'generating'

  const loadingText =
    loadingPhase === 'analyzing'
      ? 'Analyzing visual style\u2026'
      : loadingPhase === 'generating'
        ? 'Writing prompts\u2026'
        : ''

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-10">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-neutral-900">PromptEnhancer</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Generate Flux 2 prompts from reference images and concept descriptions.
          </p>
        </div>

        <div className="border-t border-neutral-100" />

        {/* API Key */}
        <ApiKeyInput onKeyChange={handleKeyChange} />

        <div className="border-t border-neutral-100" />

        {/* Image Uploader */}
        <ImageUploader images={images} onChange={setImages} />

        <div className="border-t border-neutral-100" />

        {/* Input Form */}
        <InputForm
          values={userInputs}
          promptCount={promptCount}
          onChange={setUserInputs}
          onPromptCountChange={setPromptCount}
        />

        {/* Error */}
        {error && (
          <div className="border border-red-100 bg-red-50 rounded-sm px-4 py-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className="w-full py-3 bg-neutral-900 text-white text-sm rounded-sm hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? loadingText : 'Generate Prompts'}
        </button>

        {/* Results */}
        {result && (
          <>
            <div className="border-t border-neutral-100" />
            <PromptList prompts={result.prompts} visualStyleCues={result.visualStyleCues} />
          </>
        )}
      </div>
    </main>
  )
}
