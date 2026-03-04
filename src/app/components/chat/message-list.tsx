/**
 * UI Component: Message List
 */

'use client';

import React, { useRef, useEffect } from 'react';
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
    <div className="flex flex-col overflow-y-auto p-4">
      {messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-xl font-semibold text-gray-900">Start a conversation</p>
            <p className="text-sm text-gray-600">Ask me to create a presentation</p>
          </div>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-md rounded-lg bg-gray-100 px-4 py-2">
                <div className="flex space-x-2">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-500"></div>
                  <div className="animation-delay-200 h-2 w-2 animate-bounce rounded-full bg-gray-500"></div>
                  <div className="animation-delay-400 h-2 w-2 animate-bounce rounded-full bg-gray-500"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  );
}
