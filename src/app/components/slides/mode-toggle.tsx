/**
 * UI Component: Mode Toggle
 * Segmented control for the slide generation strategy.
 *
 *   コード | 画像
 *
 * GenerationMode values:
 *   'code'        – AI generates pptxgenjs code (default)
 *   'image-bleed' – gpt-image-2 images placed full-bleed on each slide
 */

'use client';

import React from 'react';
import { Code2, Image as ImageIcon } from 'lucide-react';

export type GenerationMode = 'code' | 'image-bleed';

interface ModeToggleProps {
  mode: GenerationMode;
  onChange: (mode: GenerationMode) => void;
  /** When true the image options are greyed out (e.g. env not configured). */
  imageModeDisabled?: boolean;
  imageModeDisabledHint?: string;
  disabled?: boolean;
}

interface ModeButtonProps {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title?: string;
  size?: 'sm' | 'xs';
}

function ModeButton({ active, disabled, onClick, icon, label, title, size = 'sm' }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`flex items-center gap-1 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
      }`}
      style={{
        background: active ? 'var(--surface)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function ModeToggle({
  mode,
  onChange,
  imageModeDisabled = false,
  imageModeDisabledHint,
  disabled = false,
}: ModeToggleProps) {
  const imageHint = imageModeDisabled
    ? (imageModeDisabledHint ?? '画像生成は無効')
    : '各スライドの画像を生成してスライド全面に貼り付け（非編集）';

  return (
    <div
      role="group"
      aria-label="生成モード"
      className="inline-flex items-center gap-0.5 rounded-lg border p-0.5"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-secondary)' }}
    >
      <ModeButton
        active={mode === 'code'}
        disabled={disabled}
        onClick={() => onChange('code')}
        icon={<Code2 size={12} />}
        label="コード"
        title="pptxgenjs コードで生成（既定）"
      />
      <ModeButton
        active={mode === 'image-bleed'}
        disabled={disabled || imageModeDisabled}
        onClick={() => onChange('image-bleed')}
        icon={<ImageIcon size={12} />}
        label="画像ベタ貼り"
        title={imageHint}
      />
    </div>
  );
}
