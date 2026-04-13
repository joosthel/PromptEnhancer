'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ImageUploader from '@/components/ImageUploader'
import PromptList from '@/components/PromptList'
import ModeSelector from '@/components/ModeSelector'
import ModelSelector from '@/components/ModelSelector'
import CreditPopup from '@/components/CreditPopup'
import BriefPanel from '@/components/BriefPanel'
import AnalysisPanel from '@/components/AnalysisPanel'
import LoadingAnimation, { type LoadingPhase as AnimLoadingPhase } from '@/components/LoadingAnimation'
import HelpModal from '@/components/HelpModal'
import RegeneratePopup from '@/components/RegeneratePopup'
import Footer from '@/components/Footer'
import { ImageInput, computeImageFingerprint } from '@/lib/image-utils'
import { UserInputs, VisualStyleCues, ImageLabel, CreativeBrief } from '@/lib/system-prompt'
import { TargetModel, GenerationMode, AppMode, DEFAULT_MODEL, DEFAULT_MODE, getDefaultModelForMode } from '@/lib/model-profiles'

interface GenerateResult {
  prompts: Array<{ label: string; prompt: string; negativePrompt?: string }>
  visualStyleCues?: VisualStyleCues
  creativeBrief?: CreativeBrief
}

type LoadingPhase = 'idle' | 'analyzing' | 'briefing' | 'generating' | 'done'

/** Creates an AbortSignal that fires after the given ms. */
function fetchTimeout(ms: number): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

const DEFAULT_INPUTS: UserInputs = {
  description: '',
}

const PROMPT_COUNTS = [1, 2, 3, 4, 5, 6]

const PLACEHOLDERS: Record<GenerationMode, string> = {
  generate:
    'Describe your scene: subject, environment, mood, lighting.\ne.g. A woman on a rain-slicked Tokyo rooftop at night, neon reflections, melancholic.',
  edit:
    'Describe the result you want.\ne.g. Replace the background with a sunset beach. Keep the subject unchanged.',
  video:
    'Describe motion and camera movement over time.\ne.g. Camera dollies in on a woman at a cafe. She looks up, rain begins outside.',
}

const ENHANCE_PLACEHOLDERS: Record<GenerationMode, string> = {
  generate:
    'Paste your prompt here to optimize for the selected model.\ne.g. beautiful woman in golden light, cinematic, moody',
  edit:
    'Paste your edit prompt here. Upload reference images for context.\ne.g. Replace the background with a moody warehouse. Keep the subject.',
  video:
    'Paste your video prompt to optimize for the selected model.\ne.g. Camera dollies in on woman at cafe, she looks up, rain begins',
}

const ARTDIRECTION_PLACEHOLDER =
  'Describe the visual narrative and mood you want to develop.\ne.g. Fashion editorial in an abandoned greenhouse. Nature reclaiming high fashion.'

export default function Home() {
  const [images, setImages] = useState<ImageInput[]>([])
  const [imageLabels, setImageLabels] = useState<ImageLabel[]>([])
  const [userInputs, setUserInputs] = useState<UserInputs>(DEFAULT_INPUTS)
  const [promptCount, setPromptCount] = useState(4)
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('idle')
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [activeMode, setActiveMode] = useState<GenerationMode>(DEFAULT_MODE)
  const [activeModel, setActiveModel] = useState<TargetModel>(DEFAULT_MODEL)
  const [appMode, setAppMode] = useState<AppMode>('generate')
  const [showCreditPopup, setShowCreditPopup] = useState(false)
  const pendingAction = useRef<(() => void) | null>(null)
  const [visionCache, setVisionCache] = useState<{ fingerprint: string; cues: VisualStyleCues } | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [showIntro, setShowIntro] = useState(false)
  const [regenOpen, setRegenOpen] = useState(false)

  // Art Direction brief — persists across mode switches so it can be reused for generation
  const [artBrief, setArtBrief] = useState<{ brief: CreativeBrief; cues?: VisualStyleCues } | null>(null)

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
    }
    // Clear prompt results when switching modes (but keep artBrief)
    if (mode !== appMode) {
      setResult(null)
      setLoadingPhase('idle')
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

  /** Switch from Art Direction to Generate/Video mode — let user choose model, then click Generate */
  function handleGenerateFromBrief(subMode: GenerationMode) {
    if (!artBrief) return
    setAppMode('generate')
    setActiveMode(subMode)
    setActiveModel(getDefaultModelForMode(subMode))
    setResult(null)
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
        signal: fetchTimeout(65_000),
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
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timed out. The AI model took too long to respond — please try again.')
      } else {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.')
      }
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
    const isBriefOnly = appMode === 'artdirection'
    const hasCachedBrief = !isBriefOnly && !!artBrief?.brief

    setError(null)
    setWarnings([])
    setResult(null)
    setLoadingPhase(
      hasCachedBrief ? 'generating'
        : hasCachedCues ? 'briefing'
        : hasImages ? 'analyzing'
        : 'briefing'
    )

    try {
      const serializedImages = images.map((img) => {
        if (img.type === 'base64') {
          return { type: 'base64' as const, data: img.data, mimeType: img.mimeType }
        }
        return { type: 'url' as const, url: img.url }
      })

      const response = await fetch('/api/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: fetchTimeout(130_000),
        body: JSON.stringify({
          images: hasCachedCues ? [] : serializedImages,
          cachedVisionCues: hasCachedCues ? visionCache!.cues : undefined,
          cachedBrief: hasCachedBrief ? artBrief!.brief : undefined,
          userInputs,
          promptCount,
          targetModel: activeModel,
          mode: activeMode,
          imageLabels: imageLabels.length > 0 ? imageLabels : undefined,
          briefOnly: isBriefOnly ? true : undefined,
        }),
      })

      if (!response.ok || !response.body) {
        const text = await response.text()
        throw new Error(text || `Request failed with status ${response.status}`)
      }

      // Read SSE stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamedVisionCues: VisualStyleCues | undefined
      let streamedBrief: CreativeBrief | undefined
      let streamCompleted = false
      let receivedPrompts = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse complete SSE events from buffer
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? '' // keep incomplete event in buffer

        for (const eventStr of events) {
          if (!eventStr.trim()) continue

          const lines = eventStr.split('\n')
          let eventName = ''
          let eventData = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) eventName = line.slice(7)
            else if (line.startsWith('data: ')) eventData = line.slice(6)
          }

          if (!eventName || !eventData) continue

          try {
            const data = JSON.parse(eventData)

            switch (eventName) {
              case 'phase':
                if (data.phase === 'analyzing' || data.phase === 'briefing' || data.phase === 'generating') {
                  setLoadingPhase(data.phase)
                }
                if (data.warning) {
                  setWarnings(prev => [...prev, data.warning])
                }
                break

              case 'vision':
                streamedVisionCues = data
                if (!hasCachedCues && hasImages) {
                  setVisionCache({ fingerprint, cues: data })
                }
                break

              case 'brief':
                streamedBrief = data
                // Show brief immediately in center column for art direction
                if (isBriefOnly) {
                  setArtBrief({ brief: data, cues: streamedVisionCues })
                } else {
                  // For generate mode, show brief in the result as it arrives
                  setResult(prev => ({
                    prompts: prev?.prompts ?? [],
                    visualStyleCues: streamedVisionCues,
                    creativeBrief: data,
                  }))
                }
                break

              case 'prompts':
                receivedPrompts = true
                if (isBriefOnly) {
                  setArtBrief({
                    brief: data.creativeBrief ?? streamedBrief,
                    cues: data.visualStyleCues ?? streamedVisionCues,
                  })
                  setResult(null)
                } else {
                  setResult({
                    prompts: data.prompts,
                    visualStyleCues: data.visualStyleCues ?? streamedVisionCues,
                    creativeBrief: data.creativeBrief ?? streamedBrief,
                  })
                }
                if (data.visualStyleCues && !hasCachedCues && hasImages) {
                  setVisionCache({ fingerprint, cues: data.visualStyleCues })
                }
                break

              case 'done':
                streamCompleted = true
                setLoadingPhase('done')
                // For art direction briefOnly, handle done event with data
                if (isBriefOnly && data.creativeBrief) {
                  setArtBrief({
                    brief: data.creativeBrief,
                    cues: data.visualStyleCues ?? streamedVisionCues,
                  })
                }
                break

              case 'error':
                throw new Error(data.error ?? 'An unexpected error occurred')
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'An unexpected error occurred') {
              throw parseErr
            }
          }
        }
      }

      // Detect stream death: if the stream ended but we never got a 'done' event, something went wrong
      if (!streamCompleted) {
        if (isBriefOnly && streamedBrief) {
          // Art direction mode got the brief — that's enough
          setLoadingPhase('done')
        } else if (receivedPrompts) {
          // Got prompts but missed done event — acceptable
          setLoadingPhase('done')
        } else {
          setError('Connection lost during generation. The server may have timed out — please try again.')
          setLoadingPhase('idle')
          return
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timed out. The AI model took too long to respond — please try again.')
      } else {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.')
      }
      setLoadingPhase('idle')
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

  async function handleSelectiveRegenerate(lockedIndices: Set<number>) {
    if (!result?.prompts) return
    setRegenOpen(false)

    const hasImages = images.length > 0
    const fingerprint = hasImages ? computeImageFingerprint(images) : ''
    const hasCachedCues = hasImages && visionCache?.fingerprint === fingerprint

    setLoadingPhase('generating')

    try {
      const serializedImages = images.map((img) => {
        if (img.type === 'base64') {
          return { type: 'base64' as const, data: img.data, mimeType: img.mimeType }
        }
        return { type: 'url' as const, url: img.url }
      })

      const response = await fetch('/api/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: fetchTimeout(130_000),
        body: JSON.stringify({
          images: hasCachedCues ? [] : serializedImages,
          cachedVisionCues: hasCachedCues ? visionCache!.cues : undefined,
          cachedBrief: result.creativeBrief ?? (artBrief?.brief || undefined),
          userInputs,
          promptCount: result.prompts.length,
          targetModel: activeModel,
          mode: activeMode,
          imageLabels: imageLabels.length > 0 ? imageLabels : undefined,
          lockedIndices: Array.from(lockedIndices),
          existingPrompts: result.prompts,
        }),
      })

      if (!response.ok || !response.body) {
        const text = await response.text()
        throw new Error(text || `Request failed with status ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let regenStreamCompleted = false
      let regenReceivedPrompts = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const eventStr of events) {
          if (!eventStr.trim()) continue
          const lines = eventStr.split('\n')
          let eventName = ''
          let eventData = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) eventName = line.slice(7)
            else if (line.startsWith('data: ')) eventData = line.slice(6)
          }
          if (!eventName || !eventData) continue

          try {
            const data = JSON.parse(eventData)
            switch (eventName) {
              case 'phase':
                if (data.phase === 'generating') setLoadingPhase('generating')
                break
              case 'prompts':
                regenReceivedPrompts = true
                setResult(prev => ({
                  prompts: data.prompts,
                  visualStyleCues: data.visualStyleCues ?? prev?.visualStyleCues,
                  creativeBrief: data.creativeBrief ?? prev?.creativeBrief,
                }))
                break
              case 'done':
                regenStreamCompleted = true
                setLoadingPhase('done')
                break
              case 'error':
                throw new Error(data.error ?? 'An unexpected error occurred')
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'An unexpected error occurred') {
              throw parseErr
            }
          }
        }
      }

      if (!regenStreamCompleted && !regenReceivedPrompts) {
        setError('Connection lost during regeneration. Please try again.')
        setLoadingPhase('idle')
      } else if (!regenStreamCompleted) {
        setLoadingPhase('done')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timed out. The AI model took too long to respond — please try again.')
      } else {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.')
      }
      setLoadingPhase('idle')
    }
  }

  // ---------- Derived state ----------

  const isLoading = loadingPhase === 'analyzing' || loadingPhase === 'briefing' || loadingPhase === 'generating'
  const hasPrompts = result && result.prompts && result.prompts.length > 0
  const hasBriefToShow = result?.creativeBrief && !hasPrompts // Brief arrived but prompts haven't yet
  const hasArtBrief = appMode === 'artdirection' && !!artBrief
  const usingArtBrief = appMode === 'generate' && !!artBrief
  // Center column opens for loading, prompt results, streamed brief, or Art Direction brief
  const showCenter = isLoading || !!hasPrompts || !!hasBriefToShow || hasArtBrief

  const loadingText =
    loadingPhase === 'analyzing'
      ? 'Analyzing references\u2026'
      : loadingPhase === 'briefing'
        ? 'Building brief\u2026'
        : loadingPhase === 'generating'
          ? 'Generating prompts\u2026'
          : ''

  const generateLabel = appMode === 'enhance' ? 'Enhance Prompt'
    : appMode === 'artdirection' ? (artBrief ? 'Regenerate Brief' : 'Develop Brief')
    : activeMode === 'edit' ? 'Generate Edit Prompts'
    : activeMode === 'video' ? 'Generate Video Prompts'
    : 'Generate Prompts'

  const placeholder = appMode === 'enhance'
    ? ENHANCE_PLACEHOLDERS[activeMode]
    : appMode === 'artdirection'
      ? ARTDIRECTION_PLACEHOLDER
      : PLACEHOLDERS[activeMode]

  const textareaLabel = appMode === 'enhance'
    ? activeMode === 'edit' ? 'Edit Prompt to Enhance' : activeMode === 'video' ? 'Video Prompt to Enhance' : 'Prompt to Enhance'
    : appMode === 'artdirection'
      ? 'Creative Direction'
      : 'Description'

  return (
    <main className="h-screen flex flex-col bg-[#FAFAFA] overflow-hidden">
      {/* Mobile message — shown on small screens */}
      <div className="flex md:hidden items-center justify-center h-full px-6">
        <div className="text-center max-w-sm space-y-4">
          <h1 className="text-lg font-medium text-neutral-900">PromptEnhancer</h1>
          <p className="text-sm text-neutral-500 leading-relaxed">
            This tool is designed for desktop use. Please open it on a device with a screen width of at least 768px for the full experience.
          </p>
          <a
            href="https://joosthelfers.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            by @joosthel
          </a>
        </div>
      </div>

      {/* Desktop layout — hidden on mobile */}
      {/* Top bar */}
      <div className="border-b border-neutral-100 shrink-0 hidden md:block">
        <div className="max-w-full mx-auto px-6 py-3 flex items-center justify-between">
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

      {/* Three-column layout */}
      <div className={`flex-1 hidden md:flex overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        showCenter ? 'max-w-full' : 'max-w-[720px] mx-auto'
      }`}>

        {/* LEFT COLUMN — Settings */}
        <div className={`shrink-0 flex flex-col overflow-y-auto transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          showCenter
            ? 'w-[280px] px-5 py-5 border-r border-neutral-100'
            : 'w-[340px] py-5 px-5'
        }`}>
          <div className="space-y-4">
            <ModeSelector
              appMode={appMode}
              generationSubMode={activeMode}
              onAppModeChange={handleAppModeChange}
              onSubModeChange={handleSubModeChange}
            />

            <div className="border-t border-neutral-100" />

            {appMode !== 'artdirection' && (
              <>
                <ModelSelector
                  activeModel={activeModel}
                  appMode={appMode}
                  generationSubMode={activeMode}
                  onChange={setActiveModel}
                />
                <div className="border-t border-neutral-100" />
              </>
            )}

            {appMode !== 'enhance' && (
              <>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-neutral-400 mb-2">
                    {appMode === 'artdirection' ? 'Shot Cards' : 'Prompts'}
                  </label>
                  <div className="flex gap-1.5">
                    {PROMPT_COUNTS.map((count) => (
                      <button
                        key={count}
                        onClick={() => setPromptCount(count)}
                        className={`w-9 h-9 text-sm rounded-sm border transition-all ${
                          promptCount === count
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400'
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* CENTER COLUMN — Results */}
        <div
          className={`overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            showCenter ? 'flex-1 min-w-0 opacity-100' : 'w-0 opacity-0'
          }`}
        >
          <div className="h-full overflow-y-auto px-6 py-5">
            {/* Show loading animation only when no streamed content is available yet */}
            {isLoading && !hasBriefToShow && !hasPrompts && !hasArtBrief && (
              <div className="flex items-center justify-center h-full">
                <LoadingAnimation phase={loadingPhase as AnimLoadingPhase} />
              </div>
            )}

            {/* Streamed brief preview — shown while prompts are still generating */}
            {hasBriefToShow && isLoading && (
              <div className="max-w-2xl mx-auto space-y-5">
                <BriefPanel brief={result!.creativeBrief!} defaultOpen />
                {result!.visualStyleCues && (
                  <AnalysisPanel cues={result!.visualStyleCues} />
                )}
                <div className="flex items-center justify-center py-4">
                  <LoadingAnimation phase={loadingPhase as AnimLoadingPhase} />
                </div>
              </div>
            )}

            {/* Art Direction brief — displayed in center */}
            {!isLoading && hasArtBrief && (
              <div className="max-w-2xl mx-auto space-y-5">
                <BriefPanel brief={artBrief!.brief} defaultOpen />
                {artBrief!.cues && (
                  <AnalysisPanel cues={artBrief!.cues} />
                )}

                {/* CTA: Generate from this brief */}
                <div className="border border-neutral-200 rounded-sm px-5 py-4 space-y-3">
                  <p className="text-sm text-neutral-600">
                    Your creative brief is ready. Generate model-specific prompts from it:
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleGenerateFromBrief('generate')}
                      className="flex-1 py-2.5 bg-neutral-900 text-white text-sm rounded-sm hover:bg-neutral-700 transition-colors"
                    >
                      Generate Image Prompts
                    </button>
                    <button
                      onClick={() => handleGenerateFromBrief('video')}
                      className="flex-1 py-2.5 bg-white text-neutral-700 text-sm rounded-sm border border-neutral-200 hover:border-neutral-400 transition-colors"
                    >
                      Generate Video Prompts
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Normal prompt results — show as soon as prompts arrive */}
            {result && hasPrompts && (
              <>
                <PromptList
                  prompts={result.prompts}
                  visualStyleCues={result.visualStyleCues}
                  creativeBrief={result.creativeBrief}
                  userInputs={userInputs}
                  activeModel={activeModel}
                  activeMode={activeMode}
                  onPromptUpdate={handlePromptUpdate}
                  displayMode="full"
                  hideBriefAndAnalysis
                />

                {/* Selective regeneration */}
                {!isLoading && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => setRegenOpen(true)}
                      className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors uppercase tracking-wider"
                    >
                      Regenerate selectively
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — Creative Input */}
        <div className={`shrink-0 flex flex-col overflow-y-auto transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          showCenter
            ? 'w-[280px] px-5 py-5 border-l border-neutral-100'
            : 'w-[340px] py-5 px-5'
        }`}>
          <div className="flex flex-col flex-1 min-h-0 gap-4">
            <ImageUploader
              images={images}
              imageLabels={imageLabels}
              maxImages={appMode === 'enhance' ? 3 : undefined}
              onChange={handleImagesChange}
              onLabelsChange={setImageLabels}
            />

            <div className="border-t border-neutral-100" />

            <div className="flex flex-col flex-1 min-h-0">
              <label className="block text-xs uppercase tracking-widest text-neutral-400 mb-2 shrink-0">
                {textareaLabel}
              </label>
              <textarea
                value={userInputs.description}
                onChange={(e) => setUserInputs({ description: e.target.value })}
                placeholder={placeholder}
                className="flex-1 min-h-[140px] w-full border border-neutral-200 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-neutral-400 resize-none placeholder:text-neutral-400"
              />
            </div>

            {usingArtBrief && (
              <div className="border border-neutral-200 bg-neutral-50 rounded-sm px-3 py-2 shrink-0 flex items-center justify-between gap-2">
                <span className="text-xs text-neutral-500">Using brief from Art Direction</span>
                <button
                  onClick={() => setArtBrief(null)}
                  className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  Clear
                </button>
              </div>
            )}

            {error && (
              <div role="alert" className="border border-red-200 bg-red-50 rounded-sm px-3 py-2.5 shrink-0">
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            {warnings.length > 0 && !error && (
              <div className="border border-amber-200 bg-amber-50 rounded-sm px-3 py-2 shrink-0 space-y-1">
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-700">{w}</p>
                ))}
              </div>
            )}

            <button
              onClick={handleGenerateClick}
              disabled={isLoading}
              className="w-full py-3 bg-neutral-900 text-white text-sm rounded-sm hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {isLoading ? loadingText : error ? 'Retry' : generateLabel}
            </button>
            <div aria-live="polite" className="sr-only">
              {isLoading ? loadingText : ''}
            </div>

            {/* Brief + Analysis — shown in right sidebar for non-Art Direction modes */}
            {appMode !== 'artdirection' && result?.creativeBrief && (
              <BriefPanel brief={result.creativeBrief} />
            )}
            {appMode !== 'artdirection' && result?.visualStyleCues && (
              <AnalysisPanel cues={result.visualStyleCues} />
            )}
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        <Footer />
      </div>

      {/* Modals */}
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <CreditPopup open={showCreditPopup} onContinue={handleCreditConfirm} onCancel={handleCreditCancel} />
      <RegeneratePopup
        open={regenOpen}
        prompts={result?.prompts ?? []}
        isLoading={isLoading}
        onRegenerate={handleSelectiveRegenerate}
        onCancel={() => setRegenOpen(false)}
      />

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
                This tool generates model-optimized prompts for AI image and video production. It runs a three-step pipeline: vision analysis of your reference images, creative brief development, and prompt derivation tailored to each model&apos;s architecture.
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
                    <p className="text-neutral-500 text-xs">Develop a creative brief, then generate image or video prompts from it.</p>
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
