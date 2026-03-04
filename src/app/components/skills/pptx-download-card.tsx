/**
 * UI Component: PPTX Download Card
 */

'use client';

import React, { useState } from 'react';
import { Presentation, Download, Check } from 'lucide-react';

interface PptxDownloadCardProps {
  title: string;
  code: string;
  onError: (error: string) => void;
}

export function PptxDownloadCard({ title, code, onError }: PptxDownloadCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
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
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
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
    </div>
  );
}
