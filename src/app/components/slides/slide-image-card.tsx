/**
 * UI Component: Slide Image Card
 * Thumbnail + lightbox preview + regenerate button for a single slide image.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { ImagePlus, RefreshCw, AlertCircle, Loader2, X, Maximize2 } from 'lucide-react';
import type { SlideItem } from '@/domain/entities/slide-work';

interface SlideImageCardProps {
  slide: SlideItem;
  onGenerate: (slideNumber: number) => void;
  onRegenerate: (slideNumber: number) => void;
  disabled?: boolean;
  /** Show 'bbox 編集可能' badge when mode is image-editable */
  showEditableBadge?: boolean;
}

export function SlideImageCard({ slide, onGenerate, onRegenerate, disabled = false, showEditableBadge = false }: SlideImageCardProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const status = slide.imageStatus ?? 'idle';
  const hasImage = Boolean(slide.imageUrl);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxOpen]);

  return (
    <div
      className="rounded-lg border p-2"
      style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-secondary)' }}
        >
          スライド画像
          {showEditableBadge && status === 'ready' && (
            <span
              className="ml-1.5 rounded px-1 py-0.5 text-[9px] font-bold tracking-normal"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
              title="bbox 抽出で編集可能 PPTX を生成します"
            >
              ✦ 編集可能
            </span>
          )}
        </span>
        {status === 'ready' && hasImage && (
          <button
            type="button"
            onClick={() => onRegenerate(slide.number)}
            disabled={disabled}
            aria-label={`スライド ${slide.number} の画像を再生成`}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-gray-100 disabled:opacity-50"
            style={{ color: 'var(--text-secondary)' }}
          >
            <RefreshCw size={10} />
            再生成
          </button>
        )}
      </div>

      <div
        className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-secondary)' }}
      >
        {status === 'generating' && (
          <div className="flex flex-col items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span>生成中...</span>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-1.5 text-center text-[11px]" style={{ color: '#b91c1c' }}>
            <AlertCircle size={20} />
            <span>生成に失敗しました</span>
            <button
              type="button"
              onClick={() => onGenerate(slide.number)}
              disabled={disabled}
              className="mt-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors hover:bg-red-50 disabled:opacity-50"
              style={{ color: '#b91c1c', border: '1px solid #fecaca' }}
            >
              再試行
            </button>
          </div>
        )}

        {status === 'ready' && hasImage && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.imageUrl!}
              alt={`スライド ${slide.number} のイメージ`}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label="画像を拡大表示"
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
              style={{ opacity: 1 }}
            >
              <Maximize2 size={12} />
            </button>
          </>
        )}

        {status === 'idle' && !hasImage && (
          <button
            type="button"
            onClick={() => onGenerate(slide.number)}
            disabled={disabled}
            className="flex flex-col items-center gap-1.5 px-3 py-2 text-[11px] transition-colors hover:bg-white disabled:opacity-50"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ImagePlus size={20} />
            <span>画像生成</span>
          </button>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && hasImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="スライド画像プレビュー"
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="プレビューを閉じる"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.imageUrl!}
            alt={`スライド ${slide.number} のイメージ拡大`}
            className="max-h-full max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
