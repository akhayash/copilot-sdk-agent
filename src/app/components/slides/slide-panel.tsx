/**
 * UI Component: Slide Panel
 * Right pane of the workspace showing slide story, preview, and download.
 */

'use client';

import React, { useMemo, useState } from 'react';
import { Layers, Presentation, Download, Check, Code, Monitor } from 'lucide-react';
import Markdown from 'react-markdown';
import type { SlideWork } from '@/domain/entities/slide-work';

interface SlideOutline {
  number: number;
  title: string;
  body: string;
}

function parseSlides(content: string): SlideOutline[] {
  const slides: SlideOutline[] = [];
  const pattern = /(?:^|\n)#{0,4}\s*スライド\s*(\d+)\s*[:：]\s*(.+)/g;
  let match: RegExpExecArray | null;
  const positions: { number: number; title: string; start: number }[] = [];

  while ((match = pattern.exec(content)) !== null) {
    positions.push({
      number: parseInt(match[1]),
      title: match[2].trim(),
      start: match.index + match[0].length,
    });
  }

  for (let i = 0; i < positions.length; i++) {
    const end = i + 1 < positions.length
      ? content.lastIndexOf('\n', positions[i + 1].start - positions[i + 1].title.length - 10)
      : content.length;
    slides.push({
      number: positions[i].number,
      title: positions[i].title,
      body: content.slice(positions[i].start, end).trim(),
    });
  }
  return slides;
}

interface SlidePanelProps {
  slideWork: SlideWork;
}

export function SlidePanel({ slideWork }: SlidePanelProps) {
  const { phase, story, pptx } = slideWork;
  const [selectedSlide, setSelectedSlide] = useState<number | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slides = useMemo(() => {
    if (!story?.storyContent) return [];
    return parseSlides(story.storyContent);
  }, [story?.storyContent]);

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

  // Empty state
  if (phase === 'empty') {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'var(--surface-secondary)' }}>
          <Monitor size={28} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>スライドワークスペース</p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          チャットでプレゼンを依頼すると<br />構成案やプレビューが表示されます
        </p>
      </div>
    );
  }

  // Planning phase (streaming)
  if (phase === 'planning') {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl thinking-pulse" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
          <Layers size={22} />
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>構成を作成中...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <Layers size={15} style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            {pptx ? pptx.title : 'スライド構成'}
          </span>
          {slides.length > 0 && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
              {slides.length}枚
            </span>
          )}
        </div>
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
              <><Download size={12} /> PPTX ダウンロード</>
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="border-b px-4 py-2 text-xs text-red-600" style={{ background: 'var(--error-bg)', borderColor: 'var(--error-border)' }}>
          {error}
        </div>
      )}

      {/* Slide content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Intro */}
        {story?.intro && (
          <div className="prose prose-sm mb-4 max-w-none">
            <Markdown>{story.intro}</Markdown>
          </div>
        )}

        {/* Slide thumbnails */}
        {slides.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {slides.map((slide) => {
              const isActive = selectedSlide === slide.number;
              return (
                <button
                  key={slide.number}
                  onClick={() => setSelectedSlide(isActive ? null : slide.number)}
                  className="slide-thumb group relative flex aspect-[16/10] flex-col rounded-lg border p-3 text-left transition-all"
                  style={{
                    borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                    background: isActive ? 'var(--accent-light)' : 'var(--surface)',
                    boxShadow: isActive ? '0 0 0 2px var(--accent-light)' : undefined,
                  }}
                >
                  <span className="text-[10px] font-bold" style={{ color: 'var(--accent)' }}>
                    {String(slide.number).padStart(2, '0')}
                  </span>
                  <span className="mt-1 line-clamp-2 text-xs font-semibold leading-tight" style={{ color: 'var(--foreground)' }}>
                    {slide.title}
                  </span>
                  <span className="mt-auto line-clamp-2 text-[9px] leading-tight opacity-50" style={{ color: 'var(--text-secondary)' }}>
                    {slide.body.replace(/[#*\-_`]/g, '').slice(0, 80)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected slide detail */}
        {selectedSlide !== null && (
          <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white" style={{ background: 'var(--accent)' }}>
                {selectedSlide}
              </span>
              <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                {slides.find((s) => s.number === selectedSlide)?.title}
              </span>
            </div>
            <div className="prose prose-sm max-w-none">
              <Markdown>{slides.find((s) => s.number === selectedSlide)?.body || ''}</Markdown>
            </div>
          </div>
        )}

        {/* PPTX ready */}
        {pptx && (
          <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'var(--accent)', background: 'var(--accent-light)' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white" style={{ background: 'var(--accent)' }}>
                <Presentation size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>プレゼンテーション生成可能</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>上の「PPTX ダウンロード」をクリック</p>
              </div>
            </div>

            <button
              onClick={() => setShowCode(!showCode)}
              className="mt-3 flex items-center gap-1 text-xs hover:underline"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Code size={11} />
              {showCode ? '生成コードを隠す' : '生成コードを表示'}
            </button>
            {showCode && (
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg p-3 text-xs" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <code>{pptx.code}</code>
              </pre>
            )}
          </div>
        )}

        {/* Generating */}
        {phase === 'generating' && !pptx && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg thinking-pulse" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
              <Presentation size={20} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>コードを生成中...</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>pptxgenjs コードを作成しています</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
