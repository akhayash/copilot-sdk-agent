/**
 * UI Component: Slide Panel
 * Right pane — Full-width scenario view with detailed slide information.
 */

'use client';

import React, { useState } from 'react';
import { Layers, Presentation, Download, Check, Code, MessageSquare, Layout, Sparkles } from 'lucide-react';
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
  onRequestGenerate?: () => void;
}

export function SlidePanel({ slideWork, onRequestGenerate }: SlidePanelProps) {
  const { phase, slides, story, designBrief, pptx, isStreaming } = slideWork;
  const [showCode, setShowCode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex h-full w-full flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b px-3 py-3 sm:px-4 md:py-2.5" style={{ borderColor: 'var(--border)' }}>
          <Layers size={15} className={isStreaming ? 'thinking-pulse' : ''} style={{ color: isStreaming ? 'var(--accent)' : 'var(--border)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {isStreaming ? 'シナリオ — 生成中...' : 'シナリオ'}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="mb-3 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded" style={{ background: 'var(--surface-secondary)' }} />
                <div className="h-3 flex-1 rounded" style={{ background: 'var(--surface-secondary)', maxWidth: `${70 + (n % 3) * 10}%` }} />
              </div>
              <div className="mt-2 space-y-1.5 pl-8">
                <div className="h-2 rounded" style={{ background: 'var(--surface-secondary)', width: '90%' }} />
                <div className="h-2 rounded" style={{ background: 'var(--surface-secondary)', width: '60%' }} />
              </div>
            </div>
          ))}
          <p className="py-4 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
            チャットでプレゼンを依頼すると、スライドシナリオが表示されます
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex flex-col gap-2 border-b px-3 py-3 sm:px-4 md:flex-row md:items-center md:justify-between md:py-2.5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex min-w-0 items-center gap-2">
          <Layers size={15} style={{ color: 'var(--accent)' }} />
          <span className="truncate text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            {pptx ? pptx.title : slides.length > 0 ? 'シナリオ' : 'ワークスペース'}
          </span>
          {slides.length > 0 && (
            <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
              {slides.length}枚
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {slides.length > 0 && !pptx && onRequestGenerate && (
            <button
              onClick={onRequestGenerate}
              disabled={isStreaming}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-all hover:opacity-90 hover:shadow-md disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--accent), #5C2D91)' }}
            >
              <Sparkles size={13} />
              PPTX を生成
            </button>
          )}
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

        {designBrief && (
          <div className="border-b px-3 py-3 sm:px-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles size={14} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>デザイン方針</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['目的', designBrief.objective],
                ['対象', designBrief.audience],
                ['トーン', designBrief.tone],
                ['ビジュアル', designBrief.visualStyle],
                ['配色ムード', designBrief.colorMood],
                ['情報密度', designBrief.density],
                ['構図方針', designBrief.layoutApproach],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{label}</div>
                  <div className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--foreground)' }}>{value}</div>
                </div>
              ))}
            </div>
            {designBrief.directions.length > 0 && (
              <div className="mt-3 rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  デザイン指示
                </div>
                <ul className="space-y-1">
                  {designBrief.directions.map((direction) => (
                    <li key={direction} className="text-xs leading-relaxed" style={{ color: 'var(--foreground)' }}>
                      <span style={{ color: 'var(--accent)', marginRight: 6 }}>•</span>{direction}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="px-3 py-2">
          {slides.map((slide) => (
              <div
                key={slide.id}
                className="mb-3 rounded-lg border"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                {/* Slide header */}
                <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: 'var(--accent)' }}>
                    {slide.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <span className="text-sm font-bold leading-snug" style={{ color: 'var(--foreground)' }}>
                        {slide.title}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {slide.icon && (
                          <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                            🎨 {slide.icon}
                          </span>
                        )}
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                          <Layout size={10} className="mr-0.5 inline" />
                          {LAYOUT_LABELS[slide.layout] || slide.layout}
                        </span>
                      </div>
                    </div>
                    {slide.keyMessage && (
                      <p className="mt-1.5 text-xs font-medium leading-snug" style={{ color: 'var(--accent)' }}>
                        💡 {slide.keyMessage}
                      </p>
                    )}
                  </div>
                </div>

                {/* Content — always fully visible */}
                <div className="border-t px-3 pb-3 pt-2.5 sm:px-4" style={{ borderColor: 'var(--border)' }}>
                  {slide.bullets.length > 0 && (
                    <div className="space-y-1 pl-1 sm:pl-10">
                      {slide.bullets.map((b, i) => (
                        <p key={i} className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          <span style={{ color: 'var(--accent)', marginRight: 6 }}>•</span>{b}
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 rounded-lg border p-3 sm:pl-10" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <MessageSquare size={12} style={{ color: 'var(--text-secondary)' }} />
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>スピーカーノート</span>
                    </div>
                    <div className="prose prose-sm max-w-none text-xs leading-relaxed">
                      <Markdown remarkPlugins={[remarkGfm]}>{slide.notes}</Markdown>
                    </div>
                  </div>
                </div>
              </div>
          ))}
        </div>

        {pptx && (
          <div className="px-3 pb-3">
            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--accent)', background: 'var(--accent-light)' }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Presentation size={20} style={{ color: 'var(--accent)' }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>プレゼンテーション準備完了</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{slides.length}枚のスライド</p>
                  </div>
                </div>
                <button
                  onClick={handleDownload}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {isGenerating ? '生成中...' : downloaded ? <><Check size={12} /> 再ダウンロード</> : <><Download size={13} /> ダウンロード</>}
                </button>
              </div>
              {/* Code artifact */}
              <div className="mt-3">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowCode(!showCode); }}
                  className="flex items-center gap-1.5 text-xs hover:underline"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Code size={13} />
                  {showCode ? 'コードを隠す' : '生成コードを表示'}
                </button>
                {showCode && (
                  <div className="mt-2 overflow-hidden rounded-lg border" style={{ border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between px-3 py-1.5" style={{ background: 'var(--surface-secondary)' }}>
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>pptxgenjs</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(pptx.code);
                        }}
                        className="rounded px-2 py-0.5 text-[10px] transition-colors hover:bg-gray-200"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        コピー
                      </button>
                    </div>
                    <pre className="max-h-64 overflow-auto p-3 text-[11px] leading-relaxed" style={{ background: 'var(--surface)', margin: 0 }}>
                      <code>{pptx.code}</code>
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
