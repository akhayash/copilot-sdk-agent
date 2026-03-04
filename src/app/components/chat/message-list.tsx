/**
 * UI Component: Message List
 */

'use client';

import React, { useRef, useEffect } from 'react';
import { Star, Presentation, FileText, BarChart3 } from 'lucide-react';
import { MessageBubble } from './message-bubble';
import type { Message } from '@/domain/entities/message';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="chat-scroll flex h-full flex-col overflow-y-auto py-4">
      {messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
              <Star size={32} fill="currentColor" />
            </div>
            <p className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>何をお手伝いしましょうか？</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>プレゼンテーションの作成をお手伝いします</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {[
                { icon: Presentation, text: '提案資料を作って' },
                { icon: BarChart3, text: 'Azure AIの概要スライド' },
                { icon: FileText, text: '事業計画プレゼン' },
              ].map(({ icon: Icon, text }) => (
                <span key={text} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  <Icon size={12} />
                  {text}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  );
}
