/**
 * UI Component: PPTX Download Card
 *
 * After download, optionally polls the quality endpoint (Phase 4B) if the server
 * exposed `x-pptx-job-id`. Polling is best-effort: if the endpoint is unavailable
 * (e.g. Phase 4B not yet implemented) the card silently skips quality reporting.
 * The download button is never gated by quality polling.
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Presentation, Download, Check, ShieldCheck, ShieldAlert, ShieldX, Loader2 } from 'lucide-react';

interface PptxDownloadCardProps {
  title: string;
  code: string;
  onError: (error: string) => void;
}

type QualityVerdict = 'pass' | 'warn' | 'fail';
type QualityStatus = 'idle' | 'polling' | 'done' | 'unavailable';

interface QualityResult {
  verdict: QualityVerdict;
  summary?: string;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 30; // ~60s safety cap

export function PptxDownloadCard({ title, code, onError }: PptxDownloadCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const [qualityStatus, setQualityStatus] = useState<QualityStatus>('idle');
  const [quality, setQuality] = useState<QualityResult | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startQualityPolling = useCallback((jobId: string) => {
    if (pollTimerRef.current) return;
    attemptsRef.current = 0;
    setQualityStatus('polling');

    const tick = async () => {
      if (!mountedRef.current) {
        stopPolling();
        return;
      }
      attemptsRef.current += 1;
      try {
        const res = await fetch(`/api/skills/pptx/quality/${encodeURIComponent(jobId)}`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (res.status === 404) {
          // Quality endpoint not available (Phase 4B not implemented) — give up silently.
          stopPolling();
          if (mountedRef.current) setQualityStatus('unavailable');
          return;
        }
        if (!res.ok) {
          if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
            stopPolling();
            if (mountedRef.current) setQualityStatus('unavailable');
          }
          return;
        }
        const data = await res.json().catch(() => null) as
          | { status?: string; verdict?: QualityVerdict; summary?: string }
          | null;
        if (!data) return;
        if (data.status === 'done' && data.verdict) {
          stopPolling();
          if (mountedRef.current) {
            setQuality({ verdict: data.verdict, summary: data.summary });
            setQualityStatus('done');
          }
        } else if (data.status === 'error') {
          stopPolling();
          if (mountedRef.current) setQualityStatus('unavailable');
        } else if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
          stopPolling();
          if (mountedRef.current) setQualityStatus('unavailable');
        }
      } catch {
        if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
          stopPolling();
          if (mountedRef.current) setQualityStatus('unavailable');
        }
      }
    };

    pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);
    void tick();
  }, [stopPolling]);

  const handleDownload = async () => {
    setIsGenerating(true);
    setFallback(null);
    try {
      const response = await fetch('/api/skills/pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, title }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `Failed to generate PPTX: ${response.status}`);
      }

      const jobId = response.headers.get('x-pptx-job-id');
      const fallbackHeader = response.headers.get('x-pptx-fallback');
      if (fallbackHeader) setFallback(fallbackHeader);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title || 'presentation'}.pptx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloaded(true);

      if (jobId) startQualityPolling(jobId);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  };

  const renderQualityBadge = () => {
    if (qualityStatus === 'polling') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
          <Loader2 size={11} className="animate-spin" />
          品質チェック中…
        </span>
      );
    }
    if (qualityStatus !== 'done' || !quality) return null;
    const palette: Record<QualityVerdict, { bg: string; fg: string; Icon: typeof ShieldCheck; label: string }> = {
      pass: { bg: '#DEF7E5', fg: '#166534', Icon: ShieldCheck, label: '品質: 良好' },
      warn: { bg: '#FEF3C7', fg: '#92400E', Icon: ShieldAlert, label: '品質: 軽微な問題' },
      fail: { bg: '#FEE2E2', fg: '#991B1B', Icon: ShieldX, label: '品質: 要再生成' },
    };
    const { bg, fg, Icon, label } = palette[quality.verdict];
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
        style={{ background: bg, color: fg }}
        title={quality.summary}
      >
        <Icon size={11} />
        {label}
      </span>
    );
  };

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--accent)', background: 'var(--accent-light)' }}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white" style={{ background: 'var(--accent)' }}>
          <Presentation size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>プレゼンテーション生成完了</p>
          <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>{title}</p>
        </div>
        <button
          onClick={handleDownload}
          disabled={isGenerating}
          className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {isGenerating ? '生成中...' : downloaded ? <><Check size={14} className="inline mr-1" />再ダウンロード</> : <><Download size={14} className="inline mr-1" />ダウンロード</>}
        </button>
      </div>
      {(fallback || qualityStatus === 'polling' || qualityStatus === 'done') && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {fallback && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: '#FEF3C7', color: '#92400E' }}>
              <ShieldAlert size={11} />
              フォールバック: {fallback}
            </span>
          )}
          {renderQualityBadge()}
        </div>
      )}
      {qualityStatus === 'done' && quality?.verdict === 'fail' && (
        <p className="mt-2 text-[11px]" style={{ color: '#991B1B' }}>
          デザインが大きくずれています。再生成しますか？
        </p>
      )}
    </div>
  );
}
