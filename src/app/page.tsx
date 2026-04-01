'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ImageUploader from '@/components/ImageUploader'
import InputForm from '@/components/InputForm'
import PromptList from '@/components/PromptList'
import ModeSelector from '@/components/ModeSelector'
import ModelSelector from '@/components/ModelSelector'
import CreditPopup from '@/components/CreditPopup'
import LoadingAnimation, { type LoadingPhase as AnimLoadingPhase } from '@/components/LoadingAnimation'
import HelpModal from '@/components/HelpModal'
import { ImageInput, computeImageFingerprint } from '@/lib/image-utils'
import { UserInputs, VisualStyleCues, ImageLabel, CreativeBrief } from '@/lib/system-prompt'
import { TargetModel, GenerationMode, AppMode, DEFAULT_MODEL, DEFAULT_MODE, getDefaultModelForMode } from '@/lib/model-profiles'

interface GenerateResult {
  prompts: Array<{ label: string; prompt: string; negativePrompt?: string }>
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
  const [appMode, setAppMode] = useState<AppMode>('generate')
  const [showCreditPopup, setShowCreditPopup] = useState(false)
  const pendingAction = useRef<(() => void) | null>(null)
  const [visionCache, setVisionCache] = useState<{ fingerprint: string; cues: VisualStyleCues } | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [showIntro, setShowIntro] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('pe_intro_seen')) {
      setShowIntro(true)
    }
  }, [])

  const handleIntroDismiss = useCallback(() => {
    setShowIntro(false)
    localStorage.setItem('pe_intro_seen', '1')
  }, [])

  useEffect(() => {
    if (!showIntro) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleIntroDismiss()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showIntro, handleIntroDismiss])

  function handleImagesChange(newImages: ImageInput[]) {
    setImages(newImages)
    if (newImages.length === 0) {
      setVisionCache(null)
      return
    }
    const newFp = computeImageFingerprint(newImages)
    if (visionCache && visionCache.fingerprint !== newFp) {
      setVisionCache(null)
    }
  }

  function handleAppModeChange(mode: AppMode) {
    setAppMode(mode)
    if (mode === 'generate') {
      setActiveMode(DEFAULT_MODE)
      setActiveModel(getDefaultModelForMode(DEFAULT_MODE))
    } else if (mode === 'artdirection') {
      setActiveMode('generate')
      setActiveModel(DEFAULT_MODEL)
    } else {
      // enhance — keep current sub-mode so edit enhancement stays available
    }
  }

  function handleSubModeChange(mode: GenerationMode) {
    setActiveMode(mode)
    setActiveModel(getDefaultModelForMode(mode))
  }

  function handleGenerateClick() {
    const action = appMode === 'enhance' ? handleEnhance : handleGenerate
    pendingAction.current = action
    setShowCreditPopup(true)
  }

  function handleCreditConfirm() {
    setShowCreditPopup(false)
    pendingAction.current?.()
    pendingAction.current = null
  }

  function handleCreditCancel() {
    setShowCreditPopup(false)
    pendingAction.current = null
  }

  async function handleEnhance() {
    if (!userInputs.description.trim()) {
      setError('Paste a prompt to enhance.')
      return
    }

    setError(null)
    setResult(null)

    const hasImages = images.length > 0
    const fingerprint = hasImages ? computeImageFingerprint(images) : ''
    const hasCachedCues = hasImages && visionCache?.fingerprint === fingerprint

    setLoadingPhase(hasCachedCues ? 'generating' : hasImages ? 'analyzing' : 'generating')

    let genTimer: ReturnType<typeof setTimeout> | null = null
    if (hasImages && !hasCachedCues) {
      genTimer = setTimeout(() => setLoadingPhase('generating'), 7000)
    }

    try {
      const serializedImages = hasImages
        ? images.map((img) => {
            if (img.type === 'base64') {
              return { type: 'base64' as const, data: img.data, mimeType: img.mimeType }
            }
            return { type: 'url' as const, url: img.url }
          })
        : undefined

      const response = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userInputs.description,
          images: hasCachedCues ? [] : serializedImages,
          cachedVisionCues: hasCachedCues ? visionCache!.cues : undefined,
          targetModel: activeModel,
          mode: activeMode,
          imageLabels: imageLabels.length > 0 ? imageLabels : undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? `Request failed with status ${response.status}`)
      }

      setResult({
        prompts: [{ label: 'Enhanced', prompt: data.prompt }],
        visualStyleCues: data.visualStyleCues,
      })

      if (data.visualStyleCues && !hasCachedCues && hasImages) {
        setVisionCache({ fingerprint, cues: data.visualStyleCues })
      }

      setLoadingPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      setLoadingPhase('idle')
    } finally {
      if (genTimer) clearTimeout(genTimer)
    }
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

    const fingerprint = hasImages ? computeImageFingerprint(images) : ''
    const hasCachedCues = hasImages && visionCache?.fingerprint === fingerprint

    setError(null)
    setResult(null)
    setLoadingPhase(hasCachedCues ? 'briefing' : hasImages ? 'analyzing' : 'briefing')

    let briefTimer: ReturnType<typeof setTimeout> | null = null
    let promptTimer: ReturnType<typeof setTimeout> | null = null
    if (hasImages && !hasCachedCues) {
      briefTimer = setTimeout(() => setLoadingPhase('briefing'), 7000)
      if (appMode !== 'artdirection') {
        promptTimer = setTimeout(() => setLoadingPhase('generating'), 14000)
      }
    } else {
      if (appMode !== 'artdirection') {
        promptTimer = setTimeout(() => setLoadingPhase('generating'), 6000)
      }
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
          images: hasCachedCues ? [] : serializedImages,
          cachedVisionCues: hasCachedCues ? visionCache!.cues : undefined,
          userInputs,
          promptCount,
          targetModel: activeModel,
          mode: activeMode,
          imageLabels: imageLabels.length > 0 ? imageLabels : undefined,
          briefOnly: appMode === 'artdirection' ? true : undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? `Request failed with status ${response.status}`)
      }

      setResult(data as GenerateResult)

      if (data.visualStyleCues && !hasCachedCues && hasImages) {
        setVisionCache({ fingerprint, cues: data.visualStyleCues })
      }

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
      ? 'Analyzing references\u2026'
      : loadingPhase === 'briefing'
        ? 'Building brief\u2026'
        : loadingPhase === 'generating'
          ? 'Generating prompts\u2026'
          : ''

  const generateLabel = appMode === 'enhance' ? 'Enhance Prompt'
    : appMode === 'artdirection' ? 'Develop Brief'
    : activeMode === 'edit' ? 'Generate Edit Prompts'
    : activeMode === 'video' ? 'Generate Video Prompts'
    : 'Generate Prompts'

  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      {/* Top bar */}
      <div className="border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-medium tracking-tight text-neutral-900">PromptEnhancer</h1>
            <span className="text-neutral-300">&middot;</span>
            <a
              href="https://joosthelfers.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              by @joosthel
            </a>
          </div>
          <button
            onClick={() => setHelpOpen(true)}
            aria-label="Open help"
            className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors px-2 py-1 rounded border border-neutral-200 hover:border-neutral-300"
          >
            ?
          </button>
        </div>
      </div>

      {/* Split panel */}
      <div className="max-w-7xl mx-auto px-6 py-8 lg:flex lg:gap-8">
        {/* Left panel - inputs */}
        <div className="lg:w-[380px] lg:flex-shrink-0 space-y-5">
          <ModeSelector
            appMode={appMode}
            generationSubMode={activeMode}
            onAppModeChange={handleAppModeChange}
            onSubModeChange={handleSubModeChange}
          />

          <div className="border-t border-neutral-100" />

          <ModelSelector
            activeModel={activeModel}
            appMode={appMode}
            generationSubMode={activeMode}
            onChange={setActiveModel}
          />

          <div className="border-t border-neutral-100" />
          <ImageUploader
            images={images}
            imageLabels={imageLabels}
            maxImages={appMode === 'enhance' ? 3 : undefined}
            onChange={handleImagesChange}
            onLabelsChange={setImageLabels}
          />

          <div className="border-t border-neutral-100" />

          <InputForm
            values={userInputs}
            promptCount={promptCount}
            appMode={appMode}
            generationSubMode={activeMode}
            onChange={setUserInputs}
            onPromptCountChange={setPromptCount}
          />

          {error && (
            <div role="alert" className="border border-red-100 bg-red-50 rounded-sm px-4 py-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            onClick={handleGenerateClick}
            disabled={isLoading}
            className="w-full py-3 bg-neutral-900 text-white text-sm rounded-sm hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? loadingText : generateLabel}
          </button>
          <div aria-live="polite" className="sr-only">
            {isLoading ? loadingText : ''}
          </div>
        </div>

        {/* Right panel - results */}
        <div className="flex-1 mt-4 lg:mt-0">
          {result && (
            <PromptList
              prompts={result.prompts}
              visualStyleCues={result.visualStyleCues}
              creativeBrief={result.creativeBrief}
              userInputs={userInputs}
              activeModel={activeModel}
              activeMode={activeMode}
              onPromptUpdate={handlePromptUpdate}
              displayMode={appMode === 'artdirection' ? 'briefOnly' : 'full'}
            />
          )}
          {!result && !isLoading && (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="max-w-md text-center space-y-4 px-6">
                <div className="text-neutral-300 text-4xl font-light tracking-tight">
                  {appMode === 'enhance' ? 'Enhance' : appMode === 'artdirection' ? 'Art Direction' : 'Generate'}
                </div>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  {appMode === 'enhance'
                    ? 'Paste an existing prompt on the left and select your target model. The enhancer will restructure and optimize it for the model\'s architecture.'
                    : appMode === 'artdirection'
                      ? 'Describe your visual narrative and upload reference images. You\'ll receive a creative brief with vision, metaphor, shot cards, and color anchors.'
                      : 'Describe your concept or upload reference images to get started. The pipeline will analyze your references, develop a creative brief, and derive model-specific prompts.'}
                </p>
                <div className="flex items-center justify-center gap-4 pt-2">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
                    Vision
                  </div>
                  <div className="w-4 border-t border-neutral-200" />
                  <div className="flex items-center gap-1.5 text-xs text-neutral-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
                    Brief
                  </div>
                  {appMode !== 'artdirection' && (
                    <>
                      <div className="w-4 border-t border-neutral-200" />
                      <div className="flex items-center gap-1.5 text-xs text-neutral-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
                        Prompts
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          {isLoading && (
            <div className="flex items-center justify-center h-64">
              <LoadingAnimation phase={loadingPhase as AnimLoadingPhase} />
            </div>
          )}
        </div>
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <CreditPopup open={showCreditPopup} onContinue={handleCreditConfirm} onCancel={handleCreditCancel} />

      {/* First-visit intro */}
      {showIntro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleIntroDismiss}>
          <div role="dialog" aria-modal="true" aria-labelledby="intro-title" className="bg-white max-w-lg w-full mx-4 rounded-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 space-y-5">
              <div>
                <h2 id="intro-title" className="text-base font-medium text-neutral-900">Welcome to PromptEnhancer</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  by <a href="https://joosthelfers.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-neutral-600 transition-colors">Joost Helfers</a>
                </p>
              </div>

              <p className="text-sm text-neutral-600 leading-relaxed">
                This tool generates model-optimized prompts for AI image and video production. It runs a three-step pipeline: vision analysis of your reference images, creative brief development, and prompt derivation tailored to each model's architecture.
              </p>

              <div className="space-y-3 text-sm">
                <div className="flex gap-3">
                  <span className="text-neutral-300 font-mono text-xs mt-0.5 shrink-0">01</span>
                  <div>
                    <p className="font-medium text-neutral-800">Prompt Enhancement</p>
                    <p className="text-neutral-500 text-xs">Paste an existing prompt and optimize it for any supported model.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-neutral-300 font-mono text-xs mt-0.5 shrink-0">02</span>
                  <div>
                    <p className="font-medium text-neutral-800">Prompt Generation</p>
                    <p className="text-neutral-500 text-xs">Upload references + describe your concept to generate diverse, model-specific prompts.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-neutral-300 font-mono text-xs mt-0.5 shrink-0">03</span>
                  <div>
                    <p className="font-medium text-neutral-800">Art Direction</p>
                    <p className="text-neutral-500 text-xs">Develop creative briefs with visual narratives, shot cards, and color anchors.</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleIntroDismiss}
                autoFocus
                className="w-full py-2.5 bg-neutral-900 text-white text-sm rounded-sm hover:bg-neutral-700 transition-colors"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
