'use client'

import { useState } from 'react'
import ImageUploader from '@/components/ImageUploader'
import InputForm from '@/components/InputForm'
import PromptList from '@/components/PromptList'
import ModelBar from '@/components/ModelBar'
import LoadingAnimation, { type LoadingPhase as AnimLoadingPhase } from '@/components/LoadingAnimation'
import { ImageInput } from '@/lib/image-utils'
import { UserInputs, VisualStyleCues, ImageLabel, CreativeBrief } from '@/lib/system-prompt'
import { TargetModel, GenerationMode, DEFAULT_MODEL, DEFAULT_MODE, getDefaultModelForMode } from '@/lib/model-profiles'

interface GenerateResult {
  prompts: Array<{ label: string; prompt: string }>
  visualStyleCues?: VisualStyleCues
  creativeBrief?: CreativeBrief
}

type LoadingPhase = 'idle' | 'analyzing' | 'briefing' | 'generating' | 'done'

const DEFAULT_INPUTS: UserInputs = {
  description: '',
}

export default function Home() {
  const [images, setImages] = useState<ImageInput[]>([])
  const [imageLabels, setImageLabels] = useState<ImageLabel[]>([])
  const [userInputs, setUserInputs] = useState<UserInputs>(DEFAULT_INPUTS)
  const [promptCount, setPromptCount] = useState(4)
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('idle')
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeMode, setActiveMode] = useState<GenerationMode>(DEFAULT_MODE)
  const [activeModel, setActiveModel] = useState<TargetModel>(DEFAULT_MODEL)

  function handleModeChange(mode: GenerationMode) {
    setActiveMode(mode)
    setActiveModel(getDefaultModelForMode(mode))
  }

  async function handleGenerate() {
    const hasImages = images.length > 0
    const hasInputs = userInputs.description.trim().length > 0

    if (!hasImages && !hasInputs) {
      setError('Add reference images or describe your concept to get started.')
      return
    }

    if (activeMode === 'edit' && !hasImages) {
      setError('Edit mode requires at least one reference image.')
      return
    }

    setError(null)
    setResult(null)
    setLoadingPhase(hasImages ? 'analyzing' : 'briefing')

    let briefTimer: ReturnType<typeof setTimeout> | null = null
    let promptTimer: ReturnType<typeof setTimeout> | null = null
    if (hasImages) {
      briefTimer = setTimeout(() => setLoadingPhase('briefing'), 7000)
      promptTimer = setTimeout(() => setLoadingPhase('generating'), 14000)
    } else {
      promptTimer = setTimeout(() => setLoadingPhase('generating'), 6000)
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
          mode: activeMode,
          imageLabels: imageLabels.length > 0 ? imageLabels : undefined,
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
      if (briefTimer) clearTimeout(briefTimer)
      if (promptTimer) clearTimeout(promptTimer)
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

  const isLoading = loadingPhase === 'analyzing' || loadingPhase === 'briefing' || loadingPhase === 'generating'

  const loadingText =
    loadingPhase === 'analyzing'
      ? 'Analyzing\u2026'
      : loadingPhase === 'briefing'
        ? 'Locking brief\u2026'
        : loadingPhase === 'generating'
          ? 'Deriving prompts\u2026'
          : ''

  const generateLabel = activeMode === 'edit' ? 'Generate Edit Prompts'
    : activeMode === 'video' ? 'Generate Video Prompts'
    : 'Generate Prompts'

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      {/* Top bar */}
      <div className="border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-medium tracking-tight text-neutral-900">PromptEnhancer</h1>
          </div>
          <ModelBar activeModel={activeModel} activeMode={activeMode} onChange={setActiveModel} />
        </div>
      </div>

      {/* Split panel */}
      <div className="max-w-7xl mx-auto px-6 py-8 lg:flex lg:gap-8">
        {/* Left panel - inputs */}
        <div className="lg:w-[340px] lg:flex-shrink-0 space-y-6">
          <ImageUploader
            images={images}
            imageLabels={imageLabels}
            onChange={setImages}
            onLabelsChange={setImageLabels}
          />
          <div className="border-t border-neutral-100" />
          <InputForm
            values={userInputs}
            promptCount={promptCount}
            activeMode={activeMode}
            onChange={setUserInputs}
            onPromptCountChange={setPromptCount}
            onModeChange={handleModeChange}
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
            {isLoading ? loadingText : generateLabel}
          </button>
        </div>

        {/* Right panel - results */}
        <div className="flex-1 mt-8 lg:mt-0">
          {result && (
            <PromptList
              prompts={result.prompts}
              visualStyleCues={result.visualStyleCues}
              creativeBrief={result.creativeBrief}
              userInputs={userInputs}
              activeModel={activeModel}
              activeMode={activeMode}
              onPromptUpdate={handlePromptUpdate}
            />
          )}
          {!result && !isLoading && (
            <div className="flex items-center justify-center h-64 text-sm text-neutral-300">
              Results will appear here
            </div>
          )}
          {isLoading && (
            <div className="flex items-center justify-center h-64">
              <LoadingAnimation phase={loadingPhase as AnimLoadingPhase} />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
