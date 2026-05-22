/**
 * UI Component: Mode Toggle
 * Hierarchical segmented control for the slide generation strategy.
 *
 * Row 1: コード | 画像
 * Row 2 (visible when 画像 is selected): ベタ貼り | 編集可能
 *
 * GenerationMode values:
 *   'code'           – AI generates pptxgenjs code (default)
 *   'image-bleed'    – gpt-image-2 images placed full-bleed on each slide
 *   'image-editable' – vision LLM extracts bbox layout → native editable PPTX
 */

'use client';

import React from 'react';
import { Code2, Image as ImageIcon, Layers } from 'lucide-react';

export type GenerationMode = 'code' | 'image-bleed' | 'image-editable';

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
  const isImageMode = mode === 'image-bleed' || mode === 'image-editable';
  const imageHint = imageModeDisabled
    ? (imageModeDisabledHint ?? '画像生成は無効')
    : '各スライドの画像を生成してから PPTX を組み立てる';

  return (
    <div className="flex flex-col gap-1">
      {/* Row 1: コード / 画像 */}
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
          active={isImageMode}
          disabled={disabled || imageModeDisabled}
          onClick={() => onChange(isImageMode ? mode : 'image-bleed')}
          icon={<ImageIcon size={12} />}
          label="画像"
          title={imageHint}
        />
      </div>

      {/* Row 2: ベタ貼り / 編集可能 — shown only when image mode is active */}
      {isImageMode && (
        <div
          role="group"
          aria-label="画像モード"
          className="inline-flex items-center gap-0.5 rounded-lg border p-0.5 ml-3"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-secondary)' }}
        >
          <ModeButton
            active={mode === 'image-bleed'}
            disabled={disabled || imageModeDisabled}
            onClick={() => onChange('image-bleed')}
            icon={<ImageIcon size={10} />}
            label="ベタ貼り"
            title="画像をスライド全面に貼り付け（高速）"
            size="xs"
          />
          <ModeButton
            active={mode === 'image-editable'}
            disabled={disabled || imageModeDisabled}
            onClick={() => onChange('image-editable')}
            icon={<Layers size={10} />}
            label="編集可能 ✦"
            title="bbox 抽出でネイティブ要素を再構築（時間がかかります）"
            size="xs"
          />
        </div>
      )}
    </div>
  );
}
