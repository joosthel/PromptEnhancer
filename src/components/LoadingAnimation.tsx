'use client'

/**
 * Nothing-style dot-ring loading animation.
 * 12 dots arranged in a circle; a sharp bright blip scans clockwise continuously.
 * Each dot fires a brief flash at a staggered delay → sequential orbit effect.
 */

const TOTAL = 12
const DURATION = 1.4 // seconds per full revolution
const DOT_RADIUS = 20 // px from container center
const DOT_SIZE = 3.5 // px dot diameter
const CONTAINER = 56 // px container size

const dots = Array.from({ length: TOTAL }, (_, i) => {
  // i=0 → top center, progresses clockwise
  const angle = (i / TOTAL) * 2 * Math.PI - Math.PI / 2
  return {
    x: CONTAINER / 2 + DOT_RADIUS * Math.cos(angle) - DOT_SIZE / 2,
    y: CONTAINER / 2 + DOT_RADIUS * Math.sin(angle) - DOT_SIZE / 2,
    delay: (i / TOTAL) * DURATION,
  }
})

export type LoadingPhase = 'analyzing' | 'briefing' | 'generating'

const PHASE_LABEL: Record<LoadingPhase, string> = {
  analyzing: 'Analyzing references',
  briefing:  'Building brief',
  generating: 'Generating prompts',
}

export default function LoadingAnimation({ phase }: { phase: LoadingPhase }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 select-none">
      {/* Dot ring */}
      <div className="relative flex-shrink-0" style={{ width: CONTAINER, height: CONTAINER }}>
        {dots.map(({ x, y, delay }, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              width: DOT_SIZE,
              height: DOT_SIZE,
              left: x,
              top: y,
              borderRadius: '50%',
              background: '#171717',
              opacity: 0.1,
              animation: `nothing-dot ${DURATION}s linear ${delay.toFixed(3)}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Phase label */}
      <span
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#a3a3a3',
        }}
      >
        {PHASE_LABEL[phase]}
      </span>

      <style>{`
        @keyframes nothing-dot {
          0%   { opacity: 1; }
          9%   { opacity: 0.1; }
          100% { opacity: 0.1; }
        }
      `}</style>
    </div>
  )
}
