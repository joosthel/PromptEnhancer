'use client'

import { useState } from 'react'
import { CreativeBrief } from '@/lib/system-prompt'

interface BriefPanelProps {
  brief: CreativeBrief
  defaultOpen?: boolean
}

export default function BriefPanel({ brief, defaultOpen = false }: BriefPanelProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-neutral-200 rounded-sm overflow-hidden min-w-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs uppercase tracking-widest text-neutral-400">
          Production Brief
        </span>
        <span className="text-neutral-400 text-sm">{open ? '\u2212' : '+'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-neutral-100 min-w-0 overflow-hidden">
          {brief.creativeVision && (
            <div className="pt-3 space-y-2 pb-3 border-b border-neutral-100">
              <p className="text-xs text-neutral-800 leading-relaxed font-medium italic break-words">
                &ldquo;{brief.creativeVision}&rdquo;
              </p>
              {brief.visualMetaphor && (
                <p className="text-[11px] text-neutral-500 leading-relaxed">{brief.visualMetaphor}</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {brief.unexpectedElement && (
                  <span className="text-[10px] px-2 py-0.5 bg-neutral-800 text-neutral-200 rounded-sm break-words">
                    ↯ {brief.unexpectedElement}
                  </span>
                )}
                {brief.dominantCreativePriority && (
                  <span className="text-[10px] px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-sm font-mono uppercase tracking-wide">
                    {brief.dominantCreativePriority}
                  </span>
                )}
              </div>
            </div>
          )}

          {brief.concepts?.length > 0 && (
            <div className="pt-1 space-y-3">
              <span className="text-[10px] uppercase tracking-widest text-neutral-400">Shot Cards</span>
              {Array.from(new Set(brief.concepts.map((c) => c.frame)))
                .sort((a, b) => a - b)
                .map((frame) => {
                  const frameConcepts = brief.concepts.filter((c) => c.frame === frame)
                  const primary = frameConcepts.find((c) => c.role === 'primary')
                  const others = frameConcepts.filter((c) => c.role !== 'primary')
                  return (
                    <div key={frame} className="flex items-start gap-2 text-xs">
                      <span className="text-neutral-300 font-mono w-4 flex-shrink-0 pt-0.5">{frame}</span>
                      <div className="min-w-0 space-y-0.5">
                        {primary && (
                          <>
                            <div className="text-neutral-700 font-medium">{primary.fiveWordPitch}</div>
                            <div className="text-neutral-400 text-[11px] font-mono">
                              {[primary.shotScale, primary.cameraAngle, primary.energyState]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                            {primary.subjectPlacement && (
                              <div className="text-neutral-400 text-[11px]">{primary.subjectPlacement}</div>
                            )}
                            {primary.emotionalIntent && (
                              <div className="text-neutral-500 text-[11px] italic">
                                {primary.emotionalIntent}
                              </div>
                            )}
                            {primary.sensoryHook && (
                              <div className="text-neutral-400 text-[11px] font-mono">
                                {primary.sensoryHook}
                              </div>
                            )}
                          </>
                        )}
                        {others.map((c, i) => (
                          <div key={i} className="text-neutral-400 text-[11px]">
                            {c.role}: {c.concept}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}

          {brief.colorAnchors?.length > 0 && (
            <div className="flex items-center gap-2 pt-2 min-w-0">
              <div className="flex gap-1 shrink-0">
                {brief.colorAnchors.map((hex, i) => (
                  <div
                    key={i}
                    title={hex}
                    className="w-5 h-5 rounded-sm border border-neutral-200 flex-shrink-0"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-neutral-400 font-mono truncate min-w-0">
                {brief.colorAnchors.join(' · ')}
              </span>
            </div>
          )}

          <div className="pt-2 space-y-2">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-neutral-400">Color Grade</span>
              <p className="text-xs text-neutral-600 mt-0.5">{brief.colorGrade}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest text-neutral-400">Light Source</span>
              <p className="text-xs text-neutral-600 mt-0.5">{brief.lightSource}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest text-neutral-400">Mood</span>
              <p className="text-xs text-neutral-600 mt-0.5">{brief.mood}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest text-neutral-400">Materials</span>
              <p className="text-xs text-neutral-600 mt-0.5">{brief.materials}</p>
            </div>
            {brief.visualMotifs?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {brief.visualMotifs.map((m, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-sm font-mono"
                  >
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="pt-1 border-t border-neutral-100">
            <p className="text-xs text-neutral-600 leading-relaxed whitespace-pre-line break-words">
              {brief.fullBrief}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
