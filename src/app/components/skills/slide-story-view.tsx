/**
 * UI Component: Slide Story View
 * Parses slide story markdown and renders as visual slide cards.
 */

'use client';

import React, { useMemo, useState } from 'react';
import { Layers, ChevronDown, ChevronUp } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface SlideOutline {
  number: number;
  title: string;
  body: string;
}

interface SlideStoryViewProps {
  /** The raw markdown containing the slide story */
  content: string;
  /** Text before the slide list (intro paragraph) */
  intro: string;
}

/** Parse "スライド N: Title" sections from markdown */
function parseSlides(content: string): SlideOutline[] {
  const slides: SlideOutline[] = [];
  // Match patterns like "スライド 1: タイトル" or "### スライド 1: タイトル"
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
    const body = content.slice(positions[i].start, end).trim();
    slides.push({
      number: positions[i].number,
      title: positions[i].title,
      body,
    });
  }

  return slides;
}

/** Check if content looks like a slide story */
export function isSlideStory(content: string): boolean {
  const slideCount = (content.match(/スライド\s*\d+\s*[:：]/g) || []).length;
  return slideCount >= 3;
}

/** Extract intro text (before first slide heading) and the slide content */
export function splitStoryContent(content: string): { intro: string; storyContent: string } {
  const firstSlide = content.search(/#{0,4}\s*スライド\s*1\s*[:：]/);
  if (firstSlide <= 0) return { intro: '', storyContent: content };
  return {
    intro: content.slice(0, firstSlide).trim(),
    storyContent: content.slice(firstSlide),
  };
}

export function SlideStoryView({ content, intro }: SlideStoryViewProps) {
  const slides = useMemo(() => parseSlides(content), [content]);
  const [expanded, setExpanded] = useState(true);
  const [selectedSlide, setSelectedSlide] = useState<number | null>(null);

  if (slides.length === 0) return null;

  return (
    <div>
      {/* Intro text */}
      {intro && (
        <div className="prose prose-sm mb-3 max-w-none">
          <Markdown remarkPlugins={[remarkGfm]}>{intro}</Markdown>
        </div>
      )}

      {/* Story header */}
      <div className="rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
            <Layers size={16} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
              スライド構成案
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              全{slides.length}枚
            </p>
          </div>
          {expanded ? <ChevronUp size={16} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-secondary)' }} />}
        </button>

        {expanded && (
          <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: 'var(--border)' }}>
            {/* Slide thumbnails grid */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {slides.map((slide) => (
                <button
                  key={slide.number}
                  onClick={() => setSelectedSlide(selectedSlide === slide.number ? null : slide.number)}
                  className={`slide-thumb flex flex-col items-start rounded-lg border p-2.5 text-left transition-all ${
                    selectedSlide === slide.number ? 'active' : ''
                  }`}
                  style={{
                    borderColor: selectedSlide === slide.number ? 'var(--accent)' : 'var(--border)',
                    background: selectedSlide === slide.number ? 'var(--accent-light)' : 'var(--surface)',
                  }}
                >
                  <span className="mb-1 text-[10px] font-medium" style={{ color: 'var(--accent)' }}>
                    {slide.number}
                  </span>
                  <span className="line-clamp-2 text-[11px] font-medium leading-tight" style={{ color: 'var(--foreground)' }}>
                    {slide.title}
                  </span>
                </button>
              ))}
            </div>

            {/* Selected slide detail */}
            {selectedSlide !== null && (
              <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-secondary)' }}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white" style={{ background: 'var(--accent)' }}>
                    {selectedSlide}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                    {slides.find((s) => s.number === selectedSlide)?.title}
                  </span>
                </div>
                <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-secondary)' }}>
                  <Markdown remarkPlugins={[remarkGfm]}>{slides.find((s) => s.number === selectedSlide)?.body || ''}</Markdown>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
