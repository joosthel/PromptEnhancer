'use client'

import { useState } from 'react'
import ImageUploader from '@/components/ImageUploader'
import InputForm from '@/components/InputForm'
import PromptList from '@/components/PromptList'
import ModelBar from '@/components/ModelBar'
import { ImageInput } from '@/lib/image-utils'
import { UserInputs, VisualStyleCues } from '@/lib/system-prompt'
import { TargetModel, DEFAULT_MODEL } from '@/lib/model-profiles'

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
  const [images, setImages] = useState<ImageInput[]>([])
  const [userInputs, setUserInputs] = useState<UserInputs>(DEFAULT_INPUTS)
  const [promptCount, setPromptCount] = useState(4)
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('idle')
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeModel, setActiveModel] = useState<TargetModel>(DEFAULT_MODEL)

  async function handleGenerate() {
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
          images: serializedImages,
          userInputs,
          promptCount,
          targetModel: activeModel,
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

  function handlePromptUpdate(index: number, newPrompt: string) {
    setResult((prev) =>
      prev
        ? {
            ...prev,
            prompts: prev.prompts.map((p, i) => (i === index ? { ...p, prompt: newPrompt } : p)),
          }
        : prev
    )
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
      {/* Model Bar - full width at top */}
      <div className="border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-medium tracking-tight text-neutral-900">PromptEnhancer</h1>
          </div>
          <ModelBar activeModel={activeModel} onChange={setActiveModel} />
        </div>
      </div>

      {/* Split panel - inputs left, results right */}
      <div className="max-w-7xl mx-auto px-6 py-8 lg:flex lg:gap-8">
        {/* Left panel - inputs */}
        <div className="lg:w-[340px] lg:flex-shrink-0 space-y-6">
          <ImageUploader images={images} onChange={setImages} />
          <div className="border-t border-neutral-100" />
          <InputForm
            values={userInputs}
            promptCount={promptCount}
            onChange={setUserInputs}
            onPromptCountChange={setPromptCount}
          />

          {error && (
            <div className="border border-red-100 bg-red-50 rounded-sm px-4 py-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className="w-full py-3 bg-neutral-900 text-white text-sm rounded-sm hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? loadingText : 'Generate Prompts'}
          </button>
        </div>

        {/* Right panel - results */}
        <div className="flex-1 mt-8 lg:mt-0">
          {result && (
            <PromptList
              prompts={result.prompts}
              visualStyleCues={result.visualStyleCues}
              userInputs={userInputs}
              activeModel={activeModel}
              onPromptUpdate={handlePromptUpdate}
            />
          )}
          {!result && !isLoading && (
            <div className="flex items-center justify-center h-64 text-sm text-neutral-300">
              Results will appear here
            </div>
          )}
          {isLoading && (
            <div className="flex items-center justify-center h-64 text-sm text-neutral-400">
              {loadingText}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
