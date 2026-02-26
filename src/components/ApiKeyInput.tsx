'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'openrouter_api_key'

interface ApiKeyInputProps {
  onKeyChange: (key: string) => void
}

export default function ApiKeyInput({ onKeyChange }: ApiKeyInputProps) {
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      setKey(stored)
      setSaved(true)
      onKeyChange(stored)
    } else {
      setEditing(true)
    }
  }, [onKeyChange])

  function handleSave() {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    localStorage.setItem(STORAGE_KEY, trimmed)
    setKey(trimmed)
    setSaved(true)
    setEditing(false)
    setInputValue('')
    onKeyChange(trimmed)
  }

  function handleChange() {
    setEditing(true)
    setInputValue(key)
  }

  function handleClear() {
    localStorage.removeItem(STORAGE_KEY)
    setKey('')
    setSaved(false)
    setEditing(true)
    setInputValue('')
    onKeyChange('')
  }

  function maskKey(k: string) {
    if (k.length <= 8) return '••••••••'
    return k.slice(0, 4) + '••••••••••••' + k.slice(-4)
  }

  if (saved && !editing) {
    return (
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-widest text-neutral-400">OpenRouter Key</span>
          <span className="font-mono text-sm text-neutral-500">{maskKey(key)}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleChange}
            className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            change
          </button>
          <button
            onClick={handleClear}
            className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            remove
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs uppercase tracking-widest text-neutral-400">
        OpenRouter API Key
      </label>
      <div className="flex gap-2">
        <input
          type="password"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="sk-or-..."
          className="flex-1 border border-neutral-200 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-neutral-400 font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          onClick={handleSave}
          disabled={!inputValue.trim()}
          className="px-4 py-2 text-sm bg-neutral-900 text-white rounded-sm hover:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
      <p className="text-xs text-neutral-400">
        Your key is stored locally in the browser and never sent to any server other than OpenRouter.
      </p>
    </div>
  )
}
