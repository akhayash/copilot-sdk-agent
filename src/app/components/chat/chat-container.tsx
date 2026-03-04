/**
 * UI Component: Chat Container
 * Main layout for chat interface
 */

'use client';

import React, { useState } from 'react';
import { MessageList } from './message-list';
import { MessageInput } from './message-input';
import { ModelSelector, AVAILABLE_MODELS } from './model-selector';
import type { Message, Attachment } from '@/domain/entities/message';

export function ChatContainer() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);

  const handleSendMessage = async (text: string, attachments?: Attachment[]) => {
    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      attachments,
      createdAt: new Date(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Build history
      const history = newMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      // Send to API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: history.slice(0, -1),
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      // Handle SSE streaming with real-time updates
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let thinkingContent = '';
      let buffer = '';
      const assistantId = crypto.randomUUID();

      // Add placeholder assistant message for streaming
      const streamingMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        metadata: { streaming: true },
      };
      setMessages([...newMessages, streamingMessage]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let updated = false;
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
                if (parsed.thinking) {
                  thinkingContent += parsed.thinking;
                  updated = true;
                }
                if (parsed.content) {
                  assistantContent += parsed.content;
                  updated = true;
                }
              } catch (e) {
                if (!(e instanceof SyntaxError)) throw e;
              }
            }
          }

          // Update message in-place during streaming
          if (updated) {
            const updatedMessage: Message = {
              id: assistantId,
              role: 'assistant',
              content: assistantContent || (thinkingContent ? '...' : ''),
              createdAt: new Date(),
              metadata: {
                ...(thinkingContent ? { thinking: thinkingContent } : {}),
                streaming: true,
              },
            };
            setMessages([...newMessages, updatedMessage]);
          }
        }
      }

      // Finalize assistant message
      const assistantMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: assistantContent || '(empty response)',
        createdAt: new Date(),
        metadata: thinkingContent ? { thinking: thinkingContent } : undefined,
      };

      setMessages([...newMessages, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'error',
        content: error instanceof Error ? error.message : 'Unknown error',
        createdAt: new Date(),
      };
      setMessages([...newMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Copilot SDK Agent</h1>
          <p className="text-sm text-gray-600">Create presentations with AI</p>
        </div>
        <ModelSelector value={selectedModel} onChange={setSelectedModel} disabled={isLoading} />
      </header>

      <main className="flex-1 overflow-hidden">
        <MessageList messages={messages} isLoading={isLoading} />
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <MessageInput onSend={handleSendMessage} disabled={isLoading} />
      </footer>
    </div>
  );
}
