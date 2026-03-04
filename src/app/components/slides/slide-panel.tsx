/**
 * UI Component: Slide Panel
 * Right pane — Full-width scenario view with detailed slide information.
 */

'use client';

import React, { useState } from 'react';
import { Layers, Presentation, Download, Check, Code, MessageSquare, Layout, ImageIcon } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SlideWork } from '@/domain/entities/slide-work';

const LAYOUT_LABELS: Record<string, string> = {
  title: 'タイトル', agenda: 'アジェンダ', section: 'セクション区切り',
  bullets: '箇条書き', cards: 'カード並列', stats: '統計ハイライト',
  comparison: '比較', timeline: 'タイムライン', diagram: '概念図', summary: 'まとめ',
};

interface SlidePanelProps {
  slideWork: SlideWork;
}

export function SlidePanel({ slideWork }: SlidePanelProps) {
  const { phase, slides, story, pptx, isStreaming } = slideWork;
  const [expandedSlides, setExpandedSlides] = useState<Set<number>>(new Set());
  const [showCode, setShowCode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSlide = (num: number) => {
    setExpandedSlides((prev) => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  };

  const handleDownload = async () => {
    if (!pptx) return;
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/skills/pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: pptx.code, title: pptx.title }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `Failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${pptx.title || 'presentation'}.pptx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Skeleton placeholder
  if (slides.length === 0 && phase !== 'ready') {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: 'var(--border)' }}>
          <Layers size={15} className={isStreaming ? 'thinking-pulse' : ''} style={{ color: isStreaming ? 'var(--accent)' : 'var(--border)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {isStreaming ? 'シナリオ — 生成中...' : 'シナリオ'}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="mb-3 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded" style={{ background: 'var(--surface-secondary)' }} />
                <div className="h-3 flex-1 rounded" style={{ background: 'var(--surface-secondary)', maxWidth: `${50 + (n % 3) * 15}%` }} />
              </div>
              <div className="mt-2 space-y-1.5 pl-8">
                <div className="h-2 rounded" style={{ background: 'var(--surface-secondary)', width: '90%' }} />
                <div className="h-2 rounded" style={{ background: 'var(--surface-secondary)', width: '60%' }} />
              </div>
            </div>
          ))}
          <p className="py-4 text-center text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            チャットでプレゼンを依頼すると、スライドシナリオが表示されます
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <Layers size={15} style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            {pptx ? pptx.title : slides.length > 0 ? 'シナリオ' : 'ワークスペース'}
          </span>
          {slides.length > 0 && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
              {slides.length}枚
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pptx && (
            <button
              onClick={handleDownload}
              disabled={isGenerating}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {isGenerating ? (
                '生成中...'
              ) : downloaded ? (
                <><Check size={12} /> 再ダウンロード</>
              ) : (
                <><Download size={12} /> PPTX</>
              )}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="border-b px-4 py-2 text-xs text-red-600" style={{ background: 'var(--error-bg)', borderColor: 'var(--error-border)' }}>
          {error}
        </div>
      )}

      {/* Scenario list */}
      <div className="flex-1 overflow-y-auto">
        {story?.intro && (
          <div className="prose prose-sm border-b px-4 py-3 text-xs" style={{ borderColor: 'var(--border)' }}>
            <Markdown remarkPlugins={[remarkGfm]}>{story.intro}</Markdown>
          </div>
        )}

        <div className="px-3 py-2">
          {slides.map((slide) => {
            const isExpanded = expandedSlides.has(slide.number);
            return (
              <div
                key={slide.id}
                className="mb-2 cursor-pointer rounded-lg border transition-all"
                style={{
                  borderColor: isExpanded ? 'var(--accent)' : 'var(--border)',
                  background: isExpanded ? 'var(--accent-light)' : 'var(--surface)',
                }}
                onClick={() => toggleSlide(slide.number)}
              >
                {/* Slide header */}
                <div className="flex items-start gap-2.5 px-3 py-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white" style={{ background: 'var(--accent)' }}>
                    {slide.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold leading-snug" style={{ color: 'var(--foreground)' }}>
                        {slide.title}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {slide.icon && (
                          <span className="rounded px-1 py-0.5 text-[8px]" style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                            🎨 {slide.icon}
                          </span>
                        )}
                        <span className="rounded px-1.5 py-0.5 text-[8px] font-medium" style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                          <Layout size={8} className="mr-0.5 inline" />
                          {LAYOUT_LABELS[slide.layout] || slide.layout}
                        </span>
                      </div>
                    </div>
                    {slide.keyMessage && (
                      <p className="mt-1 text-[10px] font-medium italic leading-snug" style={{ color: 'var(--accent)' }}>
                        💡 {slide.keyMessage}
                      </p>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="border-t px-3 pb-2.5 pt-2" style={{ borderColor: isExpanded ? 'var(--accent)' : 'var(--border)', opacity: isExpanded ? 1 : 0.9 }}>
                  {slide.bullets.length > 0 && (
                    <div className="pl-8">
                      {slide.bullets.map((b, i) => (
                        <p key={i} className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          <span style={{ color: 'var(--accent)', marginRight: 4 }}>•</span>{b}
                        </p>
                      ))}
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-2 space-y-2 pl-8">
                      {slide.notes && (
                        <div className="rounded-lg border p-2.5 text-[10px]" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                          <div className="mb-1 flex items-center gap-1">
                            <MessageSquare size={9} style={{ color: 'var(--text-secondary)' }} />
                            <span className="text-[9px] font-semibold" style={{ color: 'var(--text-secondary)' }}>スピーカーノート</span>
                          </div>
                          <div className="prose prose-sm max-w-none text-[10px]">
                            <Markdown remarkPlugins={[remarkGfm]}>{slide.notes}</Markdown>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-[9px]" style={{ color: 'var(--text-secondary)' }}>
                        <span className="flex items-center gap-1">
                          <Layout size={9} />
                          レイアウト: <strong>{LAYOUT_LABELS[slide.layout] || slide.layout}</strong>
                        </span>
                        {slide.icon && (
                          <span className="flex items-center gap-1">
                            <ImageIcon size={9} />
                            アイコン: <strong>{slide.icon}</strong>
                          </span>
                        )}
                        <span>コンテンツ: {slide.bullets.length}項目</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {pptx && (
          <div className="px-3 pb-3">
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--accent)', background: 'var(--accent-light)' }}>
              <div className="flex items-center gap-3">
                <Presentation size={18} style={{ color: 'var(--accent)' }} />
                <p className="flex-1 text-xs font-semibold" style={{ color: 'var(--foreground)' }}>プレゼンテーション準備完了</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCode(!showCode); }}
                className="mt-2 flex items-center gap-1 text-[10px] hover:underline"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Code size={10} />
                {showCode ? 'コードを隠す' : 'コードを表示'}
              </button>
              {showCode && (
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg p-2 text-[10px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <code>{pptx.code}</code>
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
