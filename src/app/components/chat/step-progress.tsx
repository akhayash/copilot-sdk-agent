/**
 * UI Component: Step Progress
 * Shows AI processing steps (tool calls, skills, intents) as a compact timeline.
 */

'use client';

import React from 'react';
import { Search, Sparkles, Wrench, MessageSquare, Loader2 } from 'lucide-react';

interface Step {
  type: string;
  name?: string;
  time: number;
}

interface StepProgressProps {
  steps: Step[];
  isStreaming: boolean;
}

const STEP_ICONS: Record<string, React.ReactNode> = {
  tool_start: <Wrench size={11} />,
  tool_end: <Wrench size={11} />,
  intent: <Sparkles size={11} />,
  skill: <Sparkles size={11} />,
  turn_start: <MessageSquare size={11} />,
  turn_end: <MessageSquare size={11} />,
};

function stepLabel(step: Step): string | null {
  switch (step.type) {
    case 'tool_start':
      if (step.name === 'web_search') return '🔍 Web検索中...';
      if (step.name === 'set_scenario') return '📋 シナリオ作成中...';
      if (step.name === 'update_slide') return '✏️ スライド更新中...';
      return `🔧 ${step.name || 'ツール'} 実行中...`;
    case 'tool_end':
      if (step.name === 'web_search') return '✅ 検索完了';
      if (step.name === 'set_scenario') return '✅ シナリオ作成完了';
      if (step.name === 'update_slide') return '✅ スライド更新完了';
      return `✅ ${step.name || 'ツール'} 完了`;
    case 'intent':
      return step.name ? `💭 ${step.name}` : null;
    case 'skill':
      return `⚡ スキル: ${step.name || ''}`;
    case 'turn_start':
      return '🤔 考え中...';
    case 'turn_end':
      return null;
    default:
      return null;
  }
}

export function StepProgress({ steps, isStreaming }: StepProgressProps) {
  // Only show unique, meaningful steps
  const visibleSteps = steps
    .map((s) => ({ ...s, label: stepLabel(s) }))
    .filter((s) => s.label !== null);

  if (visibleSteps.length === 0 && !isStreaming) return null;

  return (
    <div className="mx-4 mb-2">
      <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-secondary)' }}>
        <div className="space-y-1">
          {visibleSteps.map((step, i) => {
            const isLatest = i === visibleSteps.length - 1;
            const isRunning = isLatest && isStreaming && step.type.endsWith('_start');
            return (
              <div key={i} className="flex items-center gap-2">
                <div style={{ color: isRunning ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {isRunning ? <Loader2 size={11} className="animate-spin" /> : (STEP_ICONS[step.type] || <Search size={11} />)}
                </div>
                <span
                  className={`text-[11px] ${isRunning ? 'font-medium' : ''}`}
                  style={{ color: isRunning ? 'var(--accent)' : 'var(--text-secondary)' }}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
          {isStreaming && visibleSteps.length === 0 && (
            <div className="flex items-center gap-2">
              <Loader2 size={11} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <span className="text-[11px]" style={{ color: 'var(--accent)' }}>処理中...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
