/**
 * UI Component: PPTX Download Card
 */

'use client';

import React, { useState } from 'react';

interface PptxDownloadCardProps {
  title: string;
  code: string;
  onError: (error: string) => void;
}

export function PptxDownloadCard({ title, code, onError }: PptxDownloadCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);

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
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="my-4 rounded-lg border-2 border-green-200 bg-green-50 p-4">
      <div className="mb-3 flex items-start space-x-3">
        <span className="text-2xl">📊</span>
        <div>
          <h4 className="font-semibold text-green-900">Presentation Ready!</h4>
          <p className="text-sm text-green-700">
            <em>{title}</em>
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          disabled={isGenerating}
          className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
        >
          {isGenerating ? 'Generating...' : '⬇️ Download PPTX'}
        </button>
      </div>
    </div>
  );
}
