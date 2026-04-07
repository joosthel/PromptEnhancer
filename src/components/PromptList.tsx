'use client'

import { useState, useCallback } from 'react'
import { VisualStyleCues, UserInputs, CreativeBrief } from '@/lib/system-prompt'
import { TargetModel, GenerationMode, FIX_CATEGORIES } from '@/lib/model-profiles'
import PromptCard from './PromptCard'
import BatchActions from './BatchActions'

interface PromptListProps {
  prompts: Array<{ label: string; prompt: string; negativePrompt?: string }>
  visualStyleCues?: VisualStyleCues
  creativeBrief?: CreativeBrief
  userInputs: UserInputs
  activeModel: TargetModel
  activeMode: GenerationMode
  onPromptUpdate: (index: number, newPrompt: string) => void
  displayMode?: 'full' | 'briefOnly'
  /** When true, brief and analysis panels are rendered elsewhere — hide them here */
  hideBriefAndAnalysis?: boolean
}

export default function PromptList({
  prompts,
  visualStyleCues,
  creativeBrief,
  userInputs,
  activeModel,
  activeMode,
  onPromptUpdate,
  displayMode = 'full',
  hideBriefAndAnalysis = false,
}: PromptListProps) {
  const [showCues, setShowCues] = useState(false)
  const [showBrief, setShowBrief] = useState(displayMode === 'briefOnly')
  const [fixingSet, setFixingSet] = useState<Set<number>>(new Set())
  const [reformatLoading, setReformatLoading] = useState<Map<number, TargetModel>>(new Map())
  const [selectedSet, setSelectedSet] = useState<Set<number>>(new Set())
  const [promptHistory, setPromptHistory] = useState<Map<number, Array<{ prompt: string; fix: string; timestamp: number }>>>(new Map())
  const [isBatchFixing, setIsBatchFixing] = useState(false)

  const handleFix = useCallback(async (index: number, fixCategory: string, customNote?: string) => {
    setFixingSet((prev) => new Set(prev).add(index))

    try {
      const currentPrompt = prompts[index].prompt
      const history = promptHistory.get(index) ?? []

      let revisionNote = ''
      let apiFixCategory: string | undefined

      if (fixCategory === 'custom') {
        revisionNote = customNote ?? ''
      } else {
        apiFixCategory = fixCategory
        const cat = FIX_CATEGORIES.find((c) => c.id === fixCategory)
        revisionNote = cat?.label ?? fixCategory
      }

      const res = await fetch('/api/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: currentPrompt,
          label: prompts[index].label,
          revisionNote: fixCategory === 'custom' ? (customNote ?? '') : '',
          fixCategory: apiFixCategory,
          history: history.map((h) => ({ prompt: h.prompt, fix: h.fix })),
          userInputs,
          visualStyleCues,
          targetModel: activeModel,
          mode: activeMode,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Request failed with status ${res.status}`)

      const fixLabel = fixCategory === 'custom' ? (customNote ?? 'Custom fix') : revisionNote
      const newHistoryEntry = {
        prompt: currentPrompt,
        fix: fixLabel,
        timestamp: Date.now(),
      }
      const updatedHistory = [...history, newHistoryEntry]

      setPromptHistory((prev) => {
        const next = new Map(prev)
        next.set(index, updatedHistory)
        return next
      })

      onPromptUpdate(index, data.prompt)
    } finally {
      setFixingSet((prev) => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    }
  }, [prompts, promptHistory, userInputs, visualStyleCues, activeModel, activeMode, onPromptUpdate])

  const handleBatchFix = useCallback(async (fixCategory: string) => {
    setIsBatchFixing(true)

    let category = fixCategory
    let customNote: string | undefined
    if (fixCategory.startsWith('custom:')) {
      customNote = fixCategory.slice(7)
      category = 'custom'
    }

    const indices = Array.from(selectedSet)
    try {
      await Promise.all(indices.map((i) => handleFix(i, category, customNote)))
    } finally {
      setIsBatchFixing(false)
    }
  }, [selectedSet, handleFix])

  const handleReformat = useCallback(async (index: number, toModel: TargetModel) => {
    if (toModel === activeModel) return

    setReformatLoading((prev) => {
      const next = new Map(prev)
      next.set(index, toModel)
      return next
    })

    try {
      const res = await fetch('/api/reformat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompts[index].prompt,
          label: prompts[index].label,
          fromModel: activeModel,
          toModel,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Request failed with status ${res.status}`)

      onPromptUpdate(index, data.prompt)
    } finally {
      setReformatLoading((prev) => {
        const next = new Map(prev)
        next.delete(index)
        return next
      })
    }
  }, [prompts, activeModel, onPromptUpdate])

  const handleRestore = useCallback((index: number, historyIndex: number) => {
    const history = promptHistory.get(index)
    if (!history || historyIndex >= history.length) return

    const restoredPrompt = history[historyIndex].prompt
    onPromptUpdate(index, restoredPrompt)

    setPromptHistory((prev) => {
      const next = new Map(prev)
      next.set(index, history.slice(0, historyIndex))
      return next
    })
  }, [promptHistory, onPromptUpdate])

  function toggleSelect(index: number) {
    setSelectedSet((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  function selectAll() {
    setSelectedSet(new Set(prompts.map((_, i) => i)))
  }

  function deselectAll() {
    setSelectedSet(new Set())
  }

  return (
    <div className="space-y-6 min-w-0">
      {displayMode === 'full' && (
        <BatchActions
          totalCount={prompts.length}
          selectedCount={selectedSet.size}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onBatchFix={handleBatchFix}
          isBatchFixing={isBatchFixing}
        />
      )}

      {creativeBrief && !hideBriefAndAnalysis && (
        <div className="border border-neutral-200 rounded-sm">
          {displayMode === 'briefOnly' ? (
            <div className="px-4 py-3">
              <span className="text-xs uppercase tracking-widest text-neutral-400">
                Production Brief
              </span>
            </div>
          ) : (
            <button
              onClick={() => setShowBrief(!showBrief)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-xs uppercase tracking-widest text-neutral-400">
                Production Brief
              </span>
              <span className="text-neutral-400 text-sm">{showBrief ? '\u2212' : '+'}</span>
            </button>
          )}

          {showBrief && (
            <div className="px-4 pb-4 space-y-3 border-t border-neutral-100 min-w-0">
              {/* Creative Vision — shown prominently at top */}
              {creativeBrief.creativeVision && (
                <div className="pt-3 space-y-2 pb-3 border-b border-neutral-100">
                  <p className="text-xs text-neutral-800 leading-relaxed font-medium italic break-words">&ldquo;{creativeBrief.creativeVision}&rdquo;</p>
                  {creativeBrief.visualMetaphor && (
                    <p className="text-[11px] text-neutral-500 leading-relaxed">{creativeBrief.visualMetaphor}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {creativeBrief.unexpectedElement && (
                      <span className="text-[10px] px-2 py-0.5 bg-neutral-800 text-neutral-200 rounded-sm break-words">↯ {creativeBrief.unexpectedElement}</span>
                    )}
                    {creativeBrief.dominantCreativePriority && (
                      <span className="text-[10px] px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-sm font-mono uppercase tracking-wide">{creativeBrief.dominantCreativePriority}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Shot Cards */}
              {creativeBrief.concepts?.length > 0 && (
                <div className="pt-1 space-y-3">
                  <span className="text-[10px] uppercase tracking-widest text-neutral-400">Shot Cards</span>
                  {Array.from(new Set(creativeBrief.concepts.map(c => c.frame))).sort((a, b) => a - b).map(frame => {
                    const frameConcepts = creativeBrief.concepts.filter(c => c.frame === frame)
                    const primary = frameConcepts.find(c => c.role === 'primary')
                    const others = frameConcepts.filter(c => c.role !== 'primary')
                    return (
                      <div key={frame} className="flex items-start gap-2 text-xs">
                        <span className="text-neutral-300 font-mono w-4 flex-shrink-0 pt-0.5">{frame}</span>
                        <div className="min-w-0 space-y-0.5">
                          {primary && (
                            <>
                              <div className="text-neutral-700 font-medium">{primary.fiveWordPitch}</div>
                              <div className="text-neutral-400 text-[11px] font-mono">
                                {[primary.shotScale, primary.cameraAngle, primary.energyState].filter(Boolean).join(' · ')}
                              </div>
                              {primary.subjectPlacement && (
                                <div className="text-neutral-400 text-[11px]">{primary.subjectPlacement}</div>
                              )}
                              {primary.emotionalIntent && (
                                <div className="text-neutral-500 text-[11px] italic">{primary.emotionalIntent}</div>
                              )}
                              {primary.sensoryHook && (
                                <div className="text-neutral-400 text-[11px] font-mono">{primary.sensoryHook}</div>
                              )}
                            </>
                          )}
                          {others.map((c, i) => (
                            <div key={i} className="text-neutral-400 text-[11px]">{c.role}: {c.concept}</div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Color anchors */}
              {creativeBrief.colorAnchors?.length > 0 && (
                <div className="flex items-center gap-2 pt-2 min-w-0">
                  <div className="flex gap-1 shrink-0">
                    {creativeBrief.colorAnchors.map((hex, i) => (
                      <div
                        key={i}
                        title={hex}
                        className="w-6 h-6 rounded-sm border border-neutral-200 flex-shrink-0"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-neutral-400 font-mono truncate min-w-0">
                    {creativeBrief.colorAnchors.join(' \u00b7 ')}
                  </span>
                </div>
              )}

              {/* Technical specs */}
              <div className="pt-2 space-y-2">
                <div><span className="text-[10px] uppercase tracking-widest text-neutral-400">Color Grade</span><p className="text-xs text-neutral-600 mt-0.5">{creativeBrief.colorGrade}</p></div>
                <div><span className="text-[10px] uppercase tracking-widest text-neutral-400">Light Source</span><p className="text-xs text-neutral-600 mt-0.5">{creativeBrief.lightSource}</p></div>
                <div><span className="text-[10px] uppercase tracking-widest text-neutral-400">Mood</span><p className="text-xs text-neutral-600 mt-0.5">{creativeBrief.mood}</p></div>
                <div><span className="text-[10px] uppercase tracking-widest text-neutral-400">Materials</span><p className="text-xs text-neutral-600 mt-0.5">{creativeBrief.materials}</p></div>
                {creativeBrief.visualMotifs?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {creativeBrief.visualMotifs.map((m, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-sm font-mono">{m}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Full brief */}
              <div className="pt-1 border-t border-neutral-100">
                <p className="text-xs text-neutral-600 leading-relaxed whitespace-pre-line break-words">{creativeBrief.fullBrief}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {visualStyleCues && !hideBriefAndAnalysis && (
        <div className="border border-neutral-200 rounded-sm">
          <button
            onClick={() => setShowCues(!showCues)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-xs uppercase tracking-widest text-neutral-400">
              Visual Analysis
            </span>
            <span className="text-neutral-400 text-sm">{showCues ? '\u2212' : '+'}</span>
          </button>

          {showCues && (
            <div className="px-4 pb-4 space-y-4 border-t border-neutral-100">
              {visualStyleCues.hexPalette?.length > 0 && (
                <div className="flex items-center gap-2 pt-3 min-w-0">
                  <div className="flex gap-1 shrink-0">
                    {visualStyleCues.hexPalette.map((hex, i) => (
                      <div
                        key={i}
                        title={hex}
                        className="w-6 h-6 rounded-sm border border-neutral-200 flex-shrink-0"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-neutral-400 font-mono truncate min-w-0">
                    {visualStyleCues.hexPalette.join(' \u00b7 ')}
                  </span>
                </div>
              )}
              {visualStyleCues.cinematicKeywords?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {visualStyleCues.cinematicKeywords.map((kw, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-sm font-mono">
                      {kw}
                    </span>
                  ))}
                </div>
              )}
              {visualStyleCues.atmosphere && (
                <p className="text-[11px] text-neutral-500 italic border-l-2 border-neutral-200 pl-2">
                  {visualStyleCues.atmosphere}
                </p>
              )}
              <p className="text-xs text-neutral-600 leading-relaxed whitespace-pre-line break-words">
                {visualStyleCues.description}
              </p>
            </div>
          )}
        </div>
      )}

      {displayMode === 'full' && (
        <div className="space-y-3">
          {prompts.map((p, i) => (
            <PromptCard
              key={i}
              label={p.label}
              prompt={p.prompt}
              negativePrompt={p.negativePrompt}
              index={i}
              activeModel={activeModel}
              activeMode={activeMode}
              history={promptHistory.get(i) ?? []}
              isSelected={selectedSet.has(i)}
              onToggleSelect={() => toggleSelect(i)}
              onFix={(fixCategory, customNote) => handleFix(i, fixCategory, customNote)}
              onRestore={(historyIndex) => handleRestore(i, historyIndex)}
              onModelReformat={(toModel) => handleReformat(i, toModel)}
              isFixing={fixingSet.has(i)}
              reformatLoadingModel={reformatLoading.get(i) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
