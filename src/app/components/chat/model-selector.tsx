/**
 * UI Component: Model Selector
 */

'use client';

import React from 'react';

export interface ModelOption {
  id: string;
  label: string;
  badge?: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'claude-opus-4.6', label: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'o3-mini', label: 'o3-mini', badge: 'Reasoning' },
];

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const selected = AVAILABLE_MODELS.find((m) => m.id === value);

  return (
    <div className="flex items-center gap-2">
      {selected?.badge && (
        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
          {selected.badge}
        </span>
      )}
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
        {AVAILABLE_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
