/**
 * UI Component: Model Selector
 * Fetches available models from /api/models on mount, falls back to defaults.
 */

'use client';

import React, { useEffect, useState } from 'react';

export interface ModelOption {
  id: string;
  label: string;
}

const DEFAULT_MODELS: ModelOption[] = [
  { id: 'claude-opus-4.6', label: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
  { id: 'gpt-5.1-codex', label: 'GPT-5.1 Codex' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'o3-mini', label: 'o3-mini' },
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
];

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelOption[]>(DEFAULT_MODELS);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.models?.length) {
          const fetched: ModelOption[] = data.models.map((m: { id: string; name?: string }) => ({
            id: m.id,
            label: m.name || m.id,
          }));
          setModels(fetched);
          // If current selection is not in the new list, switch to first
          if (!fetched.some((m) => m.id === value)) {
            onChange(fetched[0].id);
          }
        }
      })
      .catch(() => {/* keep defaults */});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="cursor-pointer appearance-none rounded-lg border px-3 py-1.5 pr-8 text-sm font-medium transition-colors hover:border-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        color: 'var(--foreground)',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23656d76' viewBox='0 0 16 16'%3E%3Cpath d='M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
      }}
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
