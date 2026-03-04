/**
 * UI Component: Message Bubble
 * Chat-only view — slide content appears in the right panel.
 * Thinking shown inline for the latest streaming message.
 */

'use client';

import React, { useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Star, AlertTriangle, Paperclip, Loader2 } from 'lucide-react';
import type { Message } from '@/domain/entities/message';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const isStreaming = message.metadata?.streaming === true;
  const thinking = message.metadata?.thinking as string | undefined;

  const displayContent = useMemo(() => {
    if (message.role !== 'assistant') return message.content;
    let content = message.content;
    // Strip pptxgenjs code blocks (shown in panel)
    content = content.replace(/```(?:javascript|js)\s*[\s\S]*?\s*```/, '').trim();
    return content || null;
  }, [message.role, message.content]);

  const isEmpty = message.role === 'assistant' && displayContent === null;

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

  if (isUser) {
    return (
      <div className="mx-4 my-3 flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm px-4 py-2.5 text-white" style={{ background: 'var(--accent)' }}>
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

  // Skip rendering empty assistant messages (e.g., only had pptx code)
  if (isEmpty && !isStreaming) return null;

  return (
    <div className="mx-4 my-3 flex justify-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
        <Star size={14} fill="currentColor" />
      </div>
      <div className="min-w-0 max-w-[85%] flex-1">
        {thinking && isStreaming && (
          <div className="mb-2 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-secondary)' }}>
            <div className="mb-1 flex items-center gap-1.5">
              <Loader2 size={10} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Thinking</span>
            </div>
            <div className="max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {thinking}
            </div>
          </div>
        )}
        <div className="rounded-2xl rounded-tl-sm px-4 py-3" style={{ background: 'var(--surface)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          {displayContent ? (
            <div className={`prose prose-sm max-w-none ${isStreaming ? 'typing-cursor' : ''}`}>
              <Markdown remarkPlugins={[remarkGfm]}>{displayContent}</Markdown>
            </div>
          ) : isStreaming ? (
            <p className="thinking-pulse text-sm" style={{ color: 'var(--text-secondary)' }}>応答を生成中...</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}