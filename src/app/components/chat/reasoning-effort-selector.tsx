/**
 * UI Component: Reasoning Effort Selector
 */

'use client';

import React from 'react';
import type { ReasoningEffortOption } from './model-selector';

const REASONING_LABELS: Record<ReasoningEffortOption, string> = {
  low: 'Reasoning: Low',
  medium: 'Reasoning: Medium',
  high: 'Reasoning: High',
  xhigh: 'Reasoning: X-High',
};

interface ReasoningEffortSelectorProps {
  value: ReasoningEffortOption;
  options: ReasoningEffortOption[];
  onChange: (value: ReasoningEffortOption) => void;
  disabled?: boolean;
}

export function ReasoningEffortSelector({
  value,
  options,
  onChange,
  disabled,
}: ReasoningEffortSelectorProps) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as ReasoningEffortOption)}
      disabled={disabled}
      suppressHydrationWarning
      aria-label="Reasoning effort"
      className="w-full min-w-0 cursor-pointer appearance-none rounded-lg border px-3 py-1.5 pr-8 text-sm font-medium transition-colors hover:border-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        color: 'var(--foreground)',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23656d76' viewBox='0 0 16 16'%3E%3Cpath d='M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {REASONING_LABELS[option]}
        </option>
      ))}
    </select>
  );
}
