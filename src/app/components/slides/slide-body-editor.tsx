/**
 * UI Component: Slide Body Editor
 * Textarea editor for `bodyMarkdown` with preview toggle + image regenerate.
 */

'use client';

import React, { useState } from 'react';
import { Eye, Pencil, RefreshCw, Check } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SlideItem } from '@/domain/entities/slide-work';

interface SlideBodyEditorProps {
  slide: SlideItem;
  onUpdate: (slideNumber: number, bodyMarkdown: string) => void;
  onRegenerateImage: (slideNumber: number) => void;
  disabled?: boolean;
}

export function SlideBodyEditor({ slide, onUpdate, onRegenerateImage, disabled = false }: SlideBodyEditorProps) {
  const incoming = slide.bodyMarkdown ?? '';
  const [draft, setDraft] = useState(incoming);
  const [lastSynced, setLastSynced] = useState(incoming);
  const [showPreview, setShowPreview] = useState(false);

  // Sync local draft when the upstream slide changes. Done during render
  // (React batches these as a single commit; avoids set-state-in-effect lint rule).
  if (incoming !== lastSynced) {
    setLastSynced(incoming);
    setDraft(incoming);
  }

  const isDirty = draft !== incoming;

  const commitDraft = () => {
    if (!isDirty) return;
    onUpdate(slide.number, draft);
    setLastSynced(draft);
  };

  return (
    <div
      className="rounded-lg border p-2"
      style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            本文（精緻化）
          </span>
          {isDirty && (
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>
              未保存
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            aria-label={showPreview ? '編集モードに切替' : 'プレビューモードに切替'}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-gray-100"
            style={{ color: 'var(--text-secondary)' }}
          >
            {showPreview ? <><Pencil size={10} />編集</> : <><Eye size={10} />プレビュー</>}
          </button>
          {isDirty && (
            <button
              type="button"
              onClick={commitDraft}
              disabled={disabled}
              aria-label="本文を保存"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80 disabled:opacity-50"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              <Check size={10} />
              保存
            </button>
          )}
        </div>
      </div>

      {showPreview ? (
        <div
          className="prose prose-sm min-h-[80px] max-w-none rounded-md border px-2.5 py-2 text-xs leading-relaxed"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--foreground)' }}
        >
          {draft.trim().length > 0 ? (
            <Markdown remarkPlugins={[remarkGfm]}>{draft}</Markdown>
          ) : (
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>本文がまだありません</span>
          )}
        </div>
      ) : (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          disabled={disabled}
          rows={5}
          placeholder="このスライドの本文を Markdown で記述...（保存すると画像生成のソースに使われます）"
          aria-label={`スライド ${slide.number} の本文`}
          className="w-full resize-y rounded-md border px-2.5 py-2 text-xs leading-relaxed transition-colors focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface)',
            color: 'var(--foreground)',
            minHeight: '90px',
          }}
        />
      )}

      <div className="mt-1.5 flex justify-end">
        <button
          type="button"
          onClick={() => {
            commitDraft();
            onRegenerateImage(slide.number);
          }}
          disabled={disabled}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors hover:opacity-80 disabled:opacity-50"
          style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
        >
          <RefreshCw size={10} />
          この本文で画像を再生成
        </button>
      </div>
    </div>
  );
}
