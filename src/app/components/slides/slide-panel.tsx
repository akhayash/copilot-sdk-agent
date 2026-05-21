/**
 * UI Component: Slide Panel
 * Right pane — Full-width scenario view with detailed slide information.
 */

'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Layers, Presentation, Download, Check, Code, MessageSquare, Layout, Sparkles, ImagePlus } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SlideWork, SlideItem } from '@/domain/entities/slide-work';
import { ModeToggle, type GenerationMode } from './mode-toggle';
import { SlideImageCard } from './slide-image-card';
import { SlideBodyEditor } from './slide-body-editor';

const LAYOUT_LABELS: Record<string, string> = {
  title: 'タイトル', agenda: 'アジェンダ', section: 'セクション区切り',
  bullets: '箇条書き', cards: 'カード並列', stats: '統計ハイライト',
  comparison: '比較', timeline: 'タイムライン', diagram: '概念図', summary: 'まとめ',
};

/**
 * Step indicator bar — shows the 3-step workflow progress.
 * Code mode:  ① シナリオ確認 → ② PPTX生成
 * Image mode: ① シナリオ確認 → ② 画像生成 → ③ PPTX生成
 */
function WorkflowStepper({
  mode,
  imagesReady,
  hasPptx,
}: {
  mode: GenerationMode;
  imagesReady: boolean;
  hasPptx: boolean;
}) {
  const isImageMode = mode === 'image-bleed' || mode === 'image-editable';

  // Steps definition
  const steps = isImageMode
    ? [
        { label: 'ストーリー確認', done: true },
        { label: '画像生成', done: imagesReady },
        { label: 'PPTX生成', done: false },
      ]
    : [
        { label: 'ストーリー確認', done: true },
        { label: 'PPTX生成', done: hasPptx },
      ];

  // Current active step index (0-based)
  const activeIdx = isImageMode
    ? imagesReady ? 2 : 1
    : hasPptx ? 1 : 1;

  return (
    <div
      className="flex items-center gap-0 border-b px-4 py-2"
      style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border)' }}
    >
      {steps.map((step, i) => {
        const isActive = i === activeIdx;
        const isDone = step.done;
        return (
          <React.Fragment key={i}>
            <div className="flex items-center gap-1.5">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0"
                style={{
                  background: isDone ? '#16a34a' : isActive ? 'var(--accent)' : 'var(--border)',
                  color: isDone || isActive ? 'white' : 'var(--text-secondary)',
                }}
              >
                {isDone ? '✓' : i + 1}
              </span>
              <span
                className="text-[11px] font-medium whitespace-nowrap"
                style={{ color: isDone ? '#16a34a' : isActive ? 'var(--foreground)' : 'var(--text-secondary)' }}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="mx-2 h-px flex-1"
                style={{ background: steps[i].done ? '#16a34a' : 'var(--border)', minWidth: 12 }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** Sticky footer — the single primary action for the current workflow step. */
function WorkflowFooter({
  mode,
  hasPptx,
  imagesReady,
  anyImageGenerating,
  isGenerating,
  isStreaming,
  elapsedSeconds,
  bboxPhase,
  onCodeGenerate,
  onCodeDownload,
  onImageGenerate,
  onImagePptx,
}: {
  mode: GenerationMode;
  hasPptx: boolean;
  imagesReady: boolean;
  anyImageGenerating: boolean;
  isGenerating: boolean;
  isStreaming: boolean;
  elapsedSeconds: number;
  bboxPhase: 'vision' | 'pptx' | null;
  onCodeGenerate?: () => void;
  onCodeDownload: () => void;
  onImageGenerate?: () => void;
  onImagePptx: () => void;
}) {
  const isImageMode = mode === 'image-bleed' || mode === 'image-editable';

  let label: React.ReactNode;
  let icon: React.ReactNode;
  let onClick: (() => void) | undefined;
  let disabled = false;
  let accent = true;

  if (!isImageMode) {
    // Code mode
    if (hasPptx) {
      label = 'PPTX をダウンロード';
      icon = <Download size={14} />;
      onClick = onCodeDownload;
      disabled = isGenerating;
    } else {
      label = isGenerating ? 'PPTX を生成中...' : 'PPTX を生成';
      icon = <Sparkles size={14} />;
      onClick = onCodeGenerate;
      disabled = isStreaming || isGenerating;
    }
  } else {
    // Image modes
    if (!imagesReady) {
      if (anyImageGenerating) {
        label = '画像を生成中...';
        icon = <span className="inline-block animate-spin text-base leading-none">⏳</span>;
        disabled = true;
        accent = false;
      } else {
        label = '② 画像を一括生成';
        icon = <ImagePlus size={14} />;
        onClick = onImageGenerate;
        disabled = isStreaming;
      }
    } else {
      // images ready → PPTX
      if (isGenerating) {
        label = bboxPhase === 'pptx'
          ? `PPTX 組み立て中... ${elapsedSeconds}s`
          : bboxPhase === 'vision'
            ? `画像解析中... ${elapsedSeconds}s`
            : '生成中...';
        icon = <span className="inline-block animate-spin text-base leading-none">⏳</span>;
        disabled = true;
      } else {
        label = '③ PPTX を生成';
        icon = <Sparkles size={14} />;
        onClick = onImagePptx;
      }
    }
  }

  return (
    <div
      className="border-t px-4 py-3 flex items-center justify-end gap-3"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: accent
            ? 'linear-gradient(135deg, var(--accent), #5C2D91)'
            : 'var(--surface-secondary)',
          color: accent ? 'white' : 'var(--text-secondary)',
        }}
      >
        {icon}
        <span>{label}</span>
      </button>
    </div>
  );
}

/** Progress banner shown during image-editable bbox extraction (~2-3 min). */
function BboxProgressBanner({
  phase,
  elapsed,
  estimatedTotal,
  slideCount,
}: {
  phase: 'vision' | 'pptx';
  elapsed: number;
  estimatedTotal: number;
  slideCount: number;
}) {
  const progressPct = Math.min(95, Math.round((elapsed / estimatedTotal) * 100));
  const remaining = Math.max(0, estimatedTotal - elapsed);
  const remainingLabel = remaining > 60
    ? `残り約${Math.ceil(remaining / 60)}分`
    : remaining > 5
      ? `残り約${remaining}秒`
      : '間もなく完了';

  const phaseLabel = phase === 'vision'
    ? `Vision AI がスライド画像を解析中（${slideCount}枚並列）`
    : 'PPTX を組み立て中...';
  const phaseDetail = phase === 'vision'
    ? '各スライドの要素・座標・テキストを抽出しています'
    : 'ネイティブ編集可能なテキストボックスを配置しています';

  return (
    <div
      className="border-b px-4 py-3 text-xs"
      style={{ background: 'var(--accent-light)', borderColor: 'var(--accent)', borderLeftWidth: 3 }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-semibold" style={{ color: 'var(--accent)' }}>{phaseLabel}</span>
        <span style={{ color: 'var(--text-secondary)' }}>{elapsed}s 経過 · {remainingLabel}</span>
      </div>
      <div className="mb-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>{phaseDetail}</div>
      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, var(--accent), #5C2D91)' }}
        />
      </div>
    </div>
  );
}

interface SlidePanelProps {
  slideWork: SlideWork;
  /** Triggers the AI to generate pptxgenjs code (code mode). */
  onRequestGenerate?: () => void;
  /** Image generation mode handlers (image-then-pptx mode). */
  onModeChange?: (mode: GenerationMode) => void;
  onGenerateImage?: (slideNumber: number) => void;
  onRegenerateImage?: (slideNumber: number) => void;
  onGenerateAllImages?: () => void;
  onUpdateSlideBody?: (slideNumber: number, bodyMarkdown: string) => void;
  /** Called when server reports 410 (image cache expired). Resets all slide imageStatus to idle. */
  onClearAllImages?: () => void;
  imageModeDisabled?: boolean;
  imageModeDisabledHint?: string;
}

export function SlidePanel({
  slideWork,
  onRequestGenerate,
  onModeChange,
  onGenerateImage,
  onRegenerateImage,
  onGenerateAllImages,
  onUpdateSlideBody,
  onClearAllImages,
  imageModeDisabled = false,
  imageModeDisabledHint,
}: SlidePanelProps) {
  const { phase, slides, story, designBrief, pptx, isStreaming } = slideWork;
  const mode: GenerationMode = slideWork.generationMode ?? 'code';
  const [showCode, setShowCode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [bboxPhase, setBboxPhase] = useState<'vision' | 'pptx' | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Estimated total seconds for bbox extraction (parallel across slides, ~130s typical)
  const estimatedTotalSeconds = useMemo(() => Math.min(280, slides.length * 75 + 30), [slides.length]);

  const startBboxTimer = () => {
    setElapsedSeconds(0);
    setBboxPhase('vision');
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
  };

  const stopBboxTimer = () => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    setBboxPhase(null);
  };

  // Switch phase label to 'pptx' when most of the estimated time has passed
  useEffect(() => {
    if (bboxPhase === 'vision' && elapsedSeconds >= estimatedTotalSeconds * 0.85) {
      setBboxPhase('pptx');
    }
  }, [elapsedSeconds, bboxPhase, estimatedTotalSeconds]);

  // Cleanup timer on unmount
  useEffect(() => () => stopBboxTimer(), []);

  const imagesReady = useMemo(
    () => slides.length > 0 && slides.every((s) => s.imageStatus === 'ready' && Boolean(s.imageUrl)),
    [slides],
  );
  const anyImageGenerating = useMemo(
    () => slides.some((s) => s.imageStatus === 'generating'),
    [slides],
  );
  const hasIdleOrErrorImage = useMemo(
    () => slides.some((s) => !s.imageStatus || s.imageStatus === 'idle' || s.imageStatus === 'error'),
    [slides],
  );

  const isImageMode = mode === 'image-bleed' || mode === 'image-editable';

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCodeDownload = async () => {
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
      downloadBlob(blob, `${pptx.title || 'presentation'}.pptx`);
      setDownloaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImageModePptx = async () => {
    if (!imagesReady) return;
    setIsGenerating(true);
    setError(null);
    try {
      const imageIds = slides
        .filter((s) => s.imageStatus === 'ready' && s.imageUrl)
        .map((s) => {
          // imageUrl shape: /api/skills/image/<imageId>
          const url = s.imageUrl ?? '';
          const imageId = url.split('/').filter(Boolean).pop() ?? '';
          return { slideNumber: s.number, imageId };
        })
        .filter((entry) => entry.imageId.length > 0);

      const scenario = slides.map((s) => ({
        number: s.number,
        title: s.title,
        keyMessage: s.keyMessage,
        layout: s.layout,
        bullets: s.bullets,
        notes: s.notes,
        icon: s.icon ?? undefined,
        bodyMarkdown: s.bodyMarkdown ?? undefined,
      }));

      const title = pptx?.title || (slides[0]?.title ?? 'presentation');
      const response = await fetch('/api/skills/pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationMode: 'image-bleed',
          imageIds,
          scenario,
          title,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        if (response.status === 410) {
          onClearAllImages?.();
          throw new Error('画像キャッシュが期限切れです。「画像を生成」ボタンでもう一度生成してください。');
        }
        throw new Error(err.error || `Failed: ${response.status}`);
      }
      const fallback = response.headers.get('x-pptx-fallback');
      const blob = await response.blob();
      downloadBlob(blob, `${title}.pptx`);
      setDownloaded(true);
      if (fallback) {
        setError(`一部スライドで簡易レイアウトを使用しました (${fallback})`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImageEditablePptx = async () => {
    if (!imagesReady) return;
    setIsGenerating(true);
    setError(null);
    startBboxTimer();
    try {
      const imageIds = slides
        .filter((s) => s.imageStatus === 'ready' && s.imageUrl)
        .map((s) => {
          const url = s.imageUrl ?? '';
          const imageId = url.split('/').filter(Boolean).pop() ?? '';
          return { slideNumber: s.number, imageId };
        })
        .filter((entry) => entry.imageId.length > 0);

      const scenario = slides.map((s) => ({
        number: s.number,
        title: s.title,
        keyMessage: s.keyMessage,
        layout: s.layout,
        bullets: s.bullets,
        notes: s.notes,
        icon: s.icon ?? undefined,
        bodyMarkdown: s.bodyMarkdown ?? undefined,
      }));

      const title = pptx?.title || (slides[0]?.title ?? 'presentation');
      const response = await fetch('/api/skills/pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationMode: 'image-editable',
          imageIds,
          scenario,
          title,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        if (response.status === 410) {
          onClearAllImages?.();
          throw new Error('画像キャッシュが期限切れです。「画像を生成」ボタンでもう一度生成してください。');
        }
        throw new Error(err.error || `Failed: ${response.status}`);
      }
      const fallbackCount = response.headers.get('x-pptx-fallback-count');
      const blob = await response.blob();
      downloadBlob(blob, `${title}.pptx`);
      setDownloaded(true);
      if (fallbackCount && Number(fallbackCount) > 0) {
        setError(`${fallbackCount}枚のスライドで簡易レイアウトを使用しました（bbox 抽出失敗）`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      stopBboxTimer();
      setIsGenerating(false);
    }
  };

  // Skeleton placeholder (empty workspace)
  if (slides.length === 0 && phase !== 'ready') {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b px-3 py-3 sm:px-4 md:py-2.5" style={{ borderColor: 'var(--border)' }}>
          <Layers size={15} className={isStreaming ? 'thinking-pulse' : ''} style={{ color: isStreaming ? 'var(--accent)' : 'var(--border)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {isStreaming ? 'シナリオ — 生成中...' : 'シナリオ'}
          </span>
          {onModeChange && (
            <div className="ml-auto">
              <ModeToggle
                mode={mode}
                onChange={onModeChange}
                imageModeDisabled={imageModeDisabled}
                imageModeDisabledHint={imageModeDisabledHint}
              />
            </div>
          )}
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
      {/* Panel header — title + slide count + mode toggle */}
      <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
        <Layers size={15} style={{ color: 'var(--accent)' }} />
        <span className="truncate text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
          {pptx ? pptx.title : slides.length > 0 ? 'シナリオ' : 'ワークスペース'}
        </span>
        {slides.length > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
            {slides.length}枚
          </span>
        )}
        {onModeChange && (
          <div className="ml-auto">
            <ModeToggle
              mode={mode}
              onChange={onModeChange}
              imageModeDisabled={imageModeDisabled}
              imageModeDisabledHint={imageModeDisabledHint}
              disabled={isStreaming || isGenerating || anyImageGenerating}
            />
          </div>
        )}
      </div>

      {/* Step indicator — shown once slides exist */}
      {slides.length > 0 && (
        <WorkflowStepper
          mode={mode}
          imagesReady={imagesReady}
          hasPptx={Boolean(pptx)}
        />
      )}

      {error && (
        <div className="border-b px-4 py-2 text-xs text-red-600" style={{ background: 'var(--error-bg)', borderColor: 'var(--error-border)' }}>
          {error}
        </div>
      )}

      {/* bbox extraction progress banner */}
      {bboxPhase && (
        <BboxProgressBanner
          phase={bboxPhase}
          elapsed={elapsedSeconds}
          estimatedTotal={estimatedTotalSeconds}
          slideCount={slides.length}
        />
      )}

      {/* Image generating status — simplified (no idle case, handled by footer) */}
      {isImageMode && !bboxPhase && anyImageGenerating && (
        <div
          className="border-b px-4 py-2 text-xs flex items-center gap-2"
          style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <span className="animate-spin inline-block">⏳</span>
          <span>画像を生成しています。完了したスライドから順次プレビューに表示されます...</span>
        </div>
      )}
      {isImageMode && !bboxPhase && imagesReady && (
        <div
          className="border-b px-4 py-2 text-xs flex items-center gap-2"
          style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border)' }}
        >
          <Check size={13} className="flex-shrink-0" style={{ color: '#16a34a' }} />
          <span style={{ color: '#16a34a' }}>全スライドの画像が揃いました</span>
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
            <SlideCard
              key={slide.id}
              slide={slide}
              mode={mode}
              isStreaming={isStreaming}
              onGenerateImage={onGenerateImage}
              onRegenerateImage={onRegenerateImage}
              onUpdateSlideBody={onUpdateSlideBody}
            />
          ))}
        </div>

        {pptx && mode === 'code' && (
          <div className="px-3 pb-3">
            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--accent)', background: 'var(--accent-light)' }}>
              <div className="flex items-center gap-3 mb-3">
                <Presentation size={20} style={{ color: 'var(--accent)' }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>プレゼンテーション準備完了</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{slides.length}枚のスライド</p>
                </div>
              </div>
              {/* Code viewer */}
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
        )}
      </div>

      {/* Sticky footer — primary action for current step */}
      {slides.length > 0 && (
        <WorkflowFooter
          mode={mode}
          hasPptx={Boolean(pptx)}
          imagesReady={imagesReady}
          anyImageGenerating={anyImageGenerating}
          isGenerating={isGenerating}
          isStreaming={isStreaming}
          elapsedSeconds={elapsedSeconds}
          bboxPhase={bboxPhase}
          onCodeGenerate={onRequestGenerate}
          onCodeDownload={handleCodeDownload}
          onImageGenerate={onGenerateAllImages}
          onImagePptx={mode === 'image-editable' ? handleImageEditablePptx : handleImageModePptx}
        />
      )}
    </div>
  );
}

interface SlideCardProps {
  slide: SlideItem;
  mode: GenerationMode;
  isStreaming: boolean;
  onGenerateImage?: (slideNumber: number) => void;
  onRegenerateImage?: (slideNumber: number) => void;
  onUpdateSlideBody?: (slideNumber: number, bodyMarkdown: string) => void;
}

function SlideCard({ slide, mode, isStreaming, onGenerateImage, onRegenerateImage, onUpdateSlideBody }: SlideCardProps) {
  const isGenerating = slide.imageStatus === 'generating';
  const showImageMode = mode === 'image-bleed' || mode === 'image-editable';

  return (
    <div
      className="mb-3 rounded-lg border transition-opacity"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--surface)',
        opacity: isGenerating ? 0.85 : 1,
      }}
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

      {/* Content */}
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

        {/* Image-then-pptx mode extras */}
        {showImageMode && (onGenerateImage || onRegenerateImage) && (
          <div className="mt-3 space-y-2 sm:pl-10">
            <SlideImageCard
              slide={slide}
              onGenerate={onGenerateImage ?? (() => undefined)}
              onRegenerate={onRegenerateImage ?? (() => undefined)}
              disabled={isStreaming}
              showEditableBadge={mode === 'image-editable'}
            />
            {onUpdateSlideBody && onRegenerateImage && (
              <SlideBodyEditor
                slide={slide}
                onUpdate={onUpdateSlideBody}
                onRegenerateImage={onRegenerateImage}
                disabled={isStreaming}
              />
            )}
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
  );
}
