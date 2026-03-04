/**
 * UI Component: Message Bubble
 */

'use client';

import React, { useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import type { Message } from '@/domain/entities/message';
import { PptxDownloadCard } from '@/app/components/skills/pptx-download-card';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const [showThinking, setShowThinking] = useState(false);

  const thinking = message.metadata?.thinking as string | undefined;

  // Detect pptxgenjs code in assistant responses
  const pptxCode = useMemo(() => {
    if (message.role !== 'assistant') return null;
    // Match ```javascript or ```js code blocks containing pptxgenjs patterns
    const match = message.content.match(/```(?:javascript|js)\s*([\s\S]*?)\s*```/);
    if (!match) return null;
    const code = match[1];
    // Verify it looks like pptxgenjs code
    if (code.includes('addSlide') || code.includes('addText') || code.includes('pres.')) {
      // Try to extract title from pres.title or first addText
      const titleMatch = code.match(/pres\.title\s*=\s*["'`]([^"'`]+)["'`]/) ||
        code.match(/title.*?["'`]([^"'`]{3,50})["'`]/);
      return { code, title: titleMatch?.[1] || 'Presentation' };
    }
    return null;
  }, [message.role, message.content]);

  return (
    <div className={`mb-4 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-md rounded-lg px-4 py-2 ${
          isError
            ? 'bg-red-100 text-red-900'
            : isUser
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-900'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            {thinking && (
              <div className="mb-2">
                <button
                  onClick={() => setShowThinking(!showThinking)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                >
                  <span>{showThinking ? '▼' : '▶'}</span>
                  <span>💭 Thinking</span>
                </button>
                {showThinking && (
                  <div className="mt-1 rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
                    <pre className="whitespace-pre-wrap font-sans">{thinking}</pre>
                  </div>
                )}
              </div>
            )}
            <Markdown>{message.content}</Markdown>
            {pptxCode && (
              <PptxDownloadCard
                title={pptxCode.title}
                code={pptxCode.code}
                onError={(err) => console.error('PPTX generation error:', err)}
              />
            )}
          </div>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-gray-300 pt-2">
            {message.attachments.map((att) => (
              <div key={att.id} className="flex items-center space-x-2 text-xs">
                <span>📎</span>
                <span>{att.filename}</span>
                <span className="text-gray-500">({(att.size / 1024).toFixed(1)} KB)</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
