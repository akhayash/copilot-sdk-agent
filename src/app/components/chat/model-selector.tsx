/**
 * UI Component: Model Selector
 * Fetches available models from /api/models on mount, falls back to defaults.
 */

'use client';

import React, { useEffect, useState } from 'react';

export type ReasoningEffortOption = 'low' | 'medium' | 'high' | 'xhigh';

export interface ModelOption {
  id: string;
  label: string;
  supportsReasoningEffort?: boolean;
  supportedReasoningEfforts?: ReasoningEffortOption[];
  defaultReasoningEffort?: ReasoningEffortOption;
}

interface ApiModelOption {
  id: string;
  name?: string;
  capabilities?: {
    supports?: {
      reasoningEffort?: boolean;
      reasoning_effort?: string[];
    };
  };
  supportedReasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

const DEFAULT_REASONING_EFFORTS: ReasoningEffortOption[] = ['low', 'medium', 'high'];
const REASONING_EFFORT_VALUES: readonly ReasoningEffortOption[] = ['low', 'medium', 'high', 'xhigh'];

const DEFAULT_MODELS: ModelOption[] = [
  { id: 'gpt-5.4', label: 'GPT-5.4' },
  { id: 'claude-opus-4.6', label: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  {
    id: 'gpt-5.3-codex',
    label: 'GPT-5.3 Codex',
    supportsReasoningEffort: true,
    supportedReasoningEfforts: DEFAULT_REASONING_EFFORTS,
    defaultReasoningEffort: 'medium',
  },
  {
    id: 'gpt-5.2',
    label: 'GPT-5.2',
    supportsReasoningEffort: true,
    supportedReasoningEfforts: DEFAULT_REASONING_EFFORTS,
    defaultReasoningEffort: 'medium',
  },
  {
    id: 'gpt-5.2-codex',
    label: 'GPT-5.2 Codex',
    supportsReasoningEffort: true,
    supportedReasoningEfforts: DEFAULT_REASONING_EFFORTS,
    defaultReasoningEffort: 'medium',
  },
  {
    id: 'gpt-5.1',
    label: 'GPT-5.1',
    supportsReasoningEffort: true,
    supportedReasoningEfforts: DEFAULT_REASONING_EFFORTS,
    defaultReasoningEffort: 'medium',
  },
  {
    id: 'gpt-5.1-codex',
    label: 'GPT-5.1 Codex',
    supportsReasoningEffort: true,
    supportedReasoningEfforts: DEFAULT_REASONING_EFFORTS,
    defaultReasoningEffort: 'medium',
  },
  {
    id: 'gpt-5-mini',
    label: 'GPT-5 mini',
    supportsReasoningEffort: true,
    supportedReasoningEfforts: DEFAULT_REASONING_EFFORTS,
    defaultReasoningEffort: 'medium',
  },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'o3-mini', label: 'o3-mini' },
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
];

function isReasoningEffortOption(value: string): value is ReasoningEffortOption {
  return REASONING_EFFORT_VALUES.includes(value as ReasoningEffortOption);
}

function normalizeReasoningEfforts(values: unknown): ReasoningEffortOption[] {
  if (!Array.isArray(values)) return [];

  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .filter(isReasoningEffortOption),
    ),
  );
}

function toModelOption(model: ApiModelOption): ModelOption {
  const supportedReasoningEfforts = normalizeReasoningEfforts(
    model.supportedReasoningEfforts ?? model.capabilities?.supports?.reasoning_effort,
  );
  const defaultReasoningEffort = typeof model.defaultReasoningEffort === 'string' && isReasoningEffortOption(model.defaultReasoningEffort)
    ? model.defaultReasoningEffort
    : undefined;

  return {
    id: model.id,
    label: model.name || model.id,
    supportsReasoningEffort: Boolean(model.capabilities?.supports?.reasoningEffort || supportedReasoningEfforts.length > 0),
    supportedReasoningEfforts,
    defaultReasoningEffort,
  };
}

function mergeModelOptions(fetchedModels: ModelOption[]) {
  const defaultsById = new Map(DEFAULT_MODELS.map((model) => [model.id, model]));
  const merged: ModelOption[] = fetchedModels.map((model) => {
    const fallback = defaultsById.get(model.id);
    return {
      ...fallback,
      ...model,
      supportsReasoningEffort: model.supportsReasoningEffort ?? fallback?.supportsReasoningEffort,
      supportedReasoningEfforts: model.supportedReasoningEfforts?.length
        ? model.supportedReasoningEfforts
        : fallback?.supportedReasoningEfforts,
      defaultReasoningEffort: model.defaultReasoningEffort ?? fallback?.defaultReasoningEffort,
    };
  });
  const fetchedIds = new Set(fetchedModels.map((model) => model.id));

  return [
    ...merged,
    ...DEFAULT_MODELS.filter((model) => !fetchedIds.has(model.id)),
  ];
}

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  onSelectedModelChange?: (model: ModelOption | null) => void;
  disabled?: boolean;
}

export function ModelSelector({ value, onChange, onSelectedModelChange, disabled }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelOption[]>(DEFAULT_MODELS);

  const handleModelChange = (nextModelId: string, availableModels: ModelOption[]) => {
    onChange(nextModelId);
    onSelectedModelChange?.(availableModels.find((model) => model.id === nextModelId) ?? null);
  };

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.models?.length) {
          const fetched = mergeModelOptions(data.models.map((m: ApiModelOption) => toModelOption(m)));
          setModels(fetched);
          // If current selection is not in the new list, switch to first
          if (!fetched.some((m) => m.id === value)) {
            handleModelChange(fetched[0].id, fetched);
          }
        }
      })
      .catch(() => {/* keep defaults */});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onSelectedModelChange?.(models.find((model) => model.id === value) ?? null);
  }, [models, onSelectedModelChange, value]);

  return (
    <select
      value={value}
      onChange={(e) => handleModelChange(e.target.value, models)}
      disabled={disabled}
      suppressHydrationWarning
      className="w-full min-w-0 cursor-pointer appearance-none rounded-lg border px-3 py-1.5 pr-8 text-sm font-medium transition-colors hover:border-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:min-w-[220px]"
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
