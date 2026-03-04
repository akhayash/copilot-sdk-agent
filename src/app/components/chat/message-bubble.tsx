/**
 * UI Component: Message Bubble
 */

'use client';

import React, { useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import { Star, Loader2, ChevronDown, ChevronRight, Code, AlertTriangle, Paperclip } from 'lucide-react';
import type { Message } from '@/domain/entities/message';
import { PptxDownloadCard } from '@/app/components/skills/pptx-download-card';
import { SlideStoryView, isSlideStory, splitStoryContent } from '@/app/components/skills/slide-story-view';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const isStreaming = message.metadata?.streaming === true;
  const [showThinking, setShowThinking] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const thinking = message.metadata?.thinking as string | undefined;

  // Detect pptxgenjs code in assistant responses
  const pptxCode = useMemo(() => {
    if (message.role !== 'assistant') return null;
    const match = message.content.match(/```(?:javascript|js)\s*([\s\S]*?)\s*```/);
    if (!match) return null;
    const code = match[1];
    if (code.includes('addSlide') || code.includes('addText') || code.includes('pres.')) {
      const titleMatch = code.match(/pres\.title\s*=\s*["'`]([^"'`]+)["'`]/) ||
        code.match(/title.*?["'`]([^"'`]{3,50})["'`]/);
      return { code, title: titleMatch?.[1] || 'Presentation' };
    }
    return null;
  }, [message.role, message.content]);

  // Strip pptxgenjs code block from displayed content
  const displayContent = useMemo(() => {
    if (!pptxCode) return message.content;
    return message.content.replace(/```(?:javascript|js)\s*[\s\S]*?\s*```/, '').trim();
  }, [message.content, pptxCode]);

  // Detect slide story content
  const slideStory = useMemo(() => {
    if (message.role !== 'assistant') return null;
    if (!isSlideStory(displayContent)) return null;
    return splitStoryContent(displayContent);
  }, [message.role, displayContent]);

  // Error message
  if (isError) {
    return (
      <div className="mx-4 my-3 flex justify-start">
        <div className="max-w-2xl rounded-lg border px-4 py-3" style={{ borderColor: 'var(--error-border)', background: 'var(--error-bg)' }}>
          <div className="flex items-center gap-2 text-sm font-medium text-red-700">
            <AlertTriangle size={14} />
            <span>エラー</span>
          </div>
          <p className="mt-1 text-sm text-red-600">{message.content}</p>
        </div>
      </div>
    );
  }

  // User message
  if (isUser) {
    return (
      <div className="mx-4 my-3 flex justify-end">
        <div className="max-w-2xl rounded-2xl rounded-br-sm px-4 py-2.5 text-white" style={{ background: 'var(--accent)' }}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-white/20 pt-2">
              {message.attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-1.5 text-xs text-white/80">
                  <Paperclip size={10} />
                  <span>{att.filename}</span>
                  <span>({(att.size / 1024).toFixed(1)} KB)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="mx-4 my-3 flex justify-start gap-3">
      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
        <Star size={16} fill="currentColor" />
      </div>

      <div className="min-w-0 max-w-3xl flex-1">
        {/* Thinking section */}
        {thinking && (
          <div className="mb-2">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors hover:bg-gray-50"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {isStreaming ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                showThinking ? <ChevronDown size={11} /> : <ChevronRight size={11} />
              )}
              <span>{isStreaming ? '考え中...' : '思考プロセスを表示'}</span>
            </button>
            {(showThinking || isStreaming) && (
              <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border px-3 py-2 text-xs leading-relaxed"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
              >
                <p className="whitespace-pre-wrap">{thinking}</p>
              </div>
            )}
          </div>
        )}

        {/* Main content */}
        <div className="rounded-2xl rounded-tl-sm px-4 py-3" style={{ background: 'var(--surface)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          {slideStory ? (
            <SlideStoryView content={slideStory.storyContent} intro={slideStory.intro} />
          ) : displayContent ? (
            <div className={`prose prose-sm max-w-none ${isStreaming && !pptxCode ? 'typing-cursor' : ''}`}>
              <Markdown>{displayContent}</Markdown>
            </div>
          ) : isStreaming && thinking ? (
            <p className="thinking-pulse text-sm" style={{ color: 'var(--text-secondary)' }}>応答を生成中...</p>
          ) : null}

          {/* PPTX generation card (replaces raw code block) */}
          {pptxCode && (
            <div className="mt-3">
              <PptxDownloadCard
                title={pptxCode.title}
                code={pptxCode.code}
                onError={(err) => console.error('PPTX generation error:', err)}
              />
              <button
                onClick={() => setShowCode(!showCode)}
                className="mt-2 flex items-center gap-1 text-xs hover:underline"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Code size={11} />
                {showCode ? '生成コードを隠す' : '生成コードを表示'}
              </button>
              {showCode && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg p-3 text-xs" style={{ background: 'var(--surface-secondary)' }}>
                  <code>{pptxCode.code}</code>
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
