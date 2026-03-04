/**
 * UI Component: Slide Panel
 * Right pane — Thinking bar + two-column layout (Scenario | SVG Preview).
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Layers, Presentation, Download, Check, Code, Monitor, Brain, FileText, ChevronUp } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SlidePreview } from './slide-preview';
import type { SlideWork } from '@/domain/entities/slide-work';

interface SlidePanelProps {
  slideWork: SlideWork;
}

export function SlidePanel({ slideWork }: SlidePanelProps) {
  const { phase, story, slides, pptx, thinking, isStreaming } = slideWork;
  const [selectedSlide, setSelectedSlide] = useState<number | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thinkingExpanded, setThinkingExpanded] = useState(true);
  const thinkingRef = useRef<HTMLDivElement>(null);

  // Auto-scroll thinking to bottom
  useEffect(() => {
    if (thinkingRef.current && isStreaming) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinking, isStreaming]);

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

  // Empty state — placeholder with paired row skeleton
  if (phase === 'empty' && !thinking) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: 'var(--border)' }}>
          <Layers size={15} style={{ color: 'var(--border)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>ワークスペース</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Column headers */}
          <div className="sticky top-0 z-10 flex border-b px-4 py-1.5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="flex w-[45%] items-center gap-1.5">
              <FileText size={11} style={{ color: 'var(--border)' }} />
              <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>シナリオ</span>
            </div>
            <div className="flex w-[55%] items-center gap-1.5">
              <Presentation size={11} style={{ color: 'var(--border)' }} />
              <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>プレビュー</span>
            </div>
          </div>
          {/* Skeleton rows */}
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="flex border-b" style={{ borderColor: 'var(--border)' }}>
              {/* Scenario skeleton */}
              <div className="w-[45%] border-r px-3 py-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded" style={{ background: 'var(--surface-secondary)' }} />
                  <div className="h-3 flex-1 rounded" style={{ background: 'var(--surface-secondary)', maxWidth: `${60 + (n % 3) * 12}%` }} />
                </div>
                <div className="mt-2 space-y-1.5 pl-7">
                  <div className="h-2 rounded" style={{ background: 'var(--surface-secondary)', width: '85%' }} />
                  <div className="h-2 rounded" style={{ background: 'var(--surface-secondary)', width: '55%' }} />
                </div>
              </div>
              {/* Preview skeleton */}
              <div className="flex w-[55%] items-start p-3">
                <div
                  className="flex aspect-[16/10] w-full flex-col rounded-lg border p-3"
                  style={{ borderColor: 'var(--border)', borderStyle: 'dashed' }}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded" style={{ background: 'var(--surface-secondary)' }} />
                    <div className="h-2.5 rounded" style={{ background: 'var(--surface-secondary)', width: `${40 + (n % 3) * 15}%` }} />
                  </div>
                  <div className="mt-auto space-y-1">
                    <div className="h-1.5 rounded" style={{ background: 'var(--surface-secondary)', width: '70%' }} />
                    <div className="h-1.5 rounded" style={{ background: 'var(--surface-secondary)', width: '45%' }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
          <p className="py-6 text-center text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            チャットでプレゼンを依頼すると、シナリオとプレビューがペアで表示されます
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
            {pptx ? pptx.title : slides.length > 0 ? 'スライド構成' : 'ワークスペース'}
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

      {/* Thinking bar */}
      {thinking && (
        <div className="border-b transition-all duration-300" style={{ borderColor: 'var(--border)', background: 'var(--surface-secondary)' }}>
          <button
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-gray-50"
          >
            <Brain size={13} className={isStreaming ? 'thinking-icon' : ''} style={{ color: 'var(--text-secondary)' }} />
            <span className="flex-1 text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              {isStreaming ? 'Thinking...' : 'Thinking'}
            </span>
            <div className="transition-transform duration-200" style={{ transform: thinkingExpanded ? 'rotate(0)' : 'rotate(180deg)' }}>
              <ChevronUp size={12} style={{ color: 'var(--text-secondary)' }} />
            </div>
          </button>
          <div
            className="thinking-bar-content overflow-hidden"
            style={{
              maxHeight: thinkingExpanded ? '200px' : '0px',
              opacity: thinkingExpanded ? 1 : 0,
              transition: 'max-height 0.3s ease, opacity 0.2s ease',
            }}
          >
            <div
              ref={thinkingRef}
              className="max-h-[180px] overflow-y-auto scroll-smooth px-4 pb-3 text-[11px] leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              <p className="whitespace-pre-wrap">{thinking}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="border-b px-4 py-2 text-xs text-red-600" style={{ background: 'var(--error-bg)', borderColor: 'var(--error-border)' }}>
          {error}
        </div>
      )}

      {/* Main content — paired rows: each slide = scenario + preview side by side */}
      <div className="flex-1 overflow-y-auto">
        {slides.length > 0 ? (
          <div>
            {/* Intro */}
            {story?.intro && (
              <div className="prose prose-sm border-b px-4 py-3 text-xs" style={{ borderColor: 'var(--border)' }}>
                <Markdown remarkPlugins={[remarkGfm]}>{story.intro}</Markdown>
              </div>
            )}

            {/* Column headers */}
            <div className="sticky top-0 z-10 flex border-b px-4 py-1.5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <div className="flex w-[45%] items-center gap-1.5">
                <FileText size={11} style={{ color: 'var(--accent)' }} />
                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>シナリオ</span>
              </div>
              <div className="flex w-[55%] items-center gap-1.5">
                <Presentation size={11} style={{ color: 'var(--accent)' }} />
                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>プレビュー</span>
              </div>
            </div>

            {/* Slide rows */}
            {slides.map((slide) => {
              const isActive = selectedSlide === slide.number;
              return (
                <div
                  key={slide.id}
                  className="flex cursor-pointer border-b transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    background: isActive ? 'var(--accent-light)' : 'transparent',
                  }}
                  onClick={() => setSelectedSlide(isActive ? null : slide.number)}
                >
                  {/* Scenario side */}
                  <div className="w-[45%] border-r px-3 py-3" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-baseline gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white" style={{ background: 'var(--accent)' }}>
                        {slide.number}
                      </span>
                      <span className="text-xs font-semibold leading-tight" style={{ color: 'var(--foreground)' }}>
                        {slide.title}
                      </span>
                    </div>
                    {slide.bullets.length > 0 && (
                      <div className="mt-1.5 pl-7">
                        {slide.bullets.slice(0, isActive ? 6 : 3).map((b, i) => (
                          <p key={i} className="truncate text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            • {b}
                          </p>
                        ))}
                        {!isActive && slide.bullets.length > 3 && (
                          <p className="text-[9px]" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>
                            +{slide.bullets.length - 3}
                          </p>
                        )}
                      </div>
                    )}
                    {/* Expanded detail */}
                    {isActive && slide.notes && (
                      <div className="mt-2 rounded-lg border p-2 pl-7 text-[10px]" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                        <div className="prose prose-sm max-w-none text-[10px]">
                          <Markdown remarkPlugins={[remarkGfm]}>{slide.notes}</Markdown>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Preview side */}
                  <div className="flex w-[55%] items-start p-3">
                    <div className={`w-full overflow-hidden rounded-lg border transition-shadow ${isActive ? 'shadow-md' : ''}`}
                      style={{ borderColor: isActive ? 'var(--accent)' : 'var(--border)' }}
                    >
                      <SlidePreview slide={slide} isTitle={slide.number === 1} className="w-full" />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* PPTX ready */}
            {pptx && (
              <div className="border-b p-4" style={{ borderColor: 'var(--border)' }}>
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
        ) : (
          /* No slides yet */
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            {phase === 'planning' || isStreaming ? (
              <>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl thinking-pulse" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                  <Layers size={22} />
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>構成を作成中...</p>
              </>
            ) : (
              <>
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'var(--surface-secondary)' }}>
                  <Monitor size={28} style={{ color: 'var(--text-secondary)' }} />
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>スライドワークスペース</p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  チャットでプレゼンを依頼すると<br />構成案やプレビューが表示されます
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
