/**
 * UI Component: Model Selector
 */

'use client';

import React from 'react';

export interface ModelOption {
  id: string;
  label: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'claude-opus-4.6', label: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'o3-mini', label: 'o3-mini' },
];

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm hover:border-gray-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
    >
      {AVAILABLE_MODELS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
