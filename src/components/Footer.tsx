export default function Footer() {
  return (
    <footer className="shrink-0 border-t border-neutral-100">
      <div className="max-w-full mx-auto px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span>Joost Helfers</span>
          <span className="text-neutral-200">&middot;</span>
          <span>Creative Technology & AI</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <a
            href="https://joosthelfers.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            joosthelfers.com
          </a>
          <span className="text-neutral-200">&middot;</span>
          <a
            href="https://instagram.com/joosthel"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            Instagram
          </a>
          <span className="text-neutral-200">&middot;</span>
          <a
            href="https://linkedin.com/in/joosthel"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            LinkedIn
          </a>
          <span className="text-neutral-200">&middot;</span>
          <a
            href="mailto:joosthelfers@gmail.com?subject=PromptEnhancer%20API%20Access%20Request&body=Hi%20Joost%2C%0A%0AI%27m%20interested%20in%20API%20access%20to%20PromptEnhancer.%0A%0AUse%20case%3A%20%0AExpected%20volume%3A%20%0A%0AThanks!"
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            API Access
          </a>
        </div>
      </div>
    </footer>
  )
}
