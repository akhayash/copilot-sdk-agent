/**
 * UI Component: Chat Container (Workspace)
 * Two-pane layout: Chat (left) + Slide Panel (right)
 */

'use client';

import React, { useState } from 'react';
import { Star, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { MessageList } from './message-list';
import { MessageInput } from './message-input';
import { ModelSelector, AVAILABLE_MODELS } from './model-selector';
import { SlidePanel } from '@/app/components/slides/slide-panel';
import type { Message, Attachment } from '@/domain/entities/message';
import type { SlideWork, SlideItem, SlideLayout } from '@/domain/entities/slide-work';

const ACCENT_CYCLE: SlideItem['accent'][] = ['blue', 'green', 'purple', 'teal', 'orange'];
const VALID_LAYOUTS: SlideLayout[] = ['title', 'agenda', 'section', 'bullets', 'cards', 'stats', 'comparison', 'timeline', 'diagram', 'summary'];

function detectPptxCode(content: string) {
  const match = content.match(/```(?:javascript|js)\s*([\s\S]*?)\s*```/);
  if (!match) return null;
  const code = match[1];
  if (code.includes('addSlide') || code.includes('addText') || code.includes('pres.')) {
    const titleMatch = code.match(/pres\.title\s*=\s*["'`]([^"'`]+)["'`]/) ||
      code.match(/title.*?["'`]([^"'`]{3,50})["'`]/);
    return { code, title: titleMatch?.[1] || 'Presentation' };
  }
  return null;
}

export function ChatContainer() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const [slideWork, setSlideWork] = useState<SlideWork>({ phase: 'empty', story: null, slides: [], pptx: null, thinking: null, isStreaming: false });
  const [panelOpen, setPanelOpen] = useState(true);
  const [scenarioTitle, setScenarioTitle] = useState<string>('Presentation');

  const handleSendMessage = async (text: string, attachments?: Attachment[]) => {
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
      const history = newMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(0, -1), model: selectedModel }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let thinkingContent = '';
      let buffer = '';
      const assistantId = crypto.randomUUID();

      setMessages([...newMessages, {
        id: assistantId, role: 'assistant', content: '', createdAt: new Date(),
        metadata: { streaming: true },
      }]);
      setSlideWork((prev) => ({ ...prev, isStreaming: true, thinking: null }));

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
                if (parsed.error) throw new Error(parsed.error);
                if (parsed.thinking) { thinkingContent += parsed.thinking; updated = true; }
                if (parsed.content) { assistantContent += parsed.content; updated = true; }
                if (parsed.scenario) {
                  // Scenario tool called — populate right panel directly
                  const { title, slides } = parsed.scenario;
                  setScenarioTitle(title);
                  const slideItems: SlideItem[] = slides.map((s: { number: number; title: string; keyMessage?: string; layout?: string; bullets: string[]; notes?: string; icon?: string }) => ({
                    id: `slide-${s.number}`,
                    number: s.number,
                    title: s.title,
                    keyMessage: s.keyMessage || '',
                    layout: (VALID_LAYOUTS.includes(s.layout as SlideLayout) ? s.layout : 'bullets') as SlideLayout,
                    bullets: s.bullets,
                    notes: s.notes || '',
                    icon: s.icon || null,
                    code: null,
                    accent: ACCENT_CYCLE[(s.number - 1) % ACCENT_CYCLE.length],
                  }));
                  setSlideWork((prev) => ({
                    ...prev,
                    phase: 'story',
                    story: { intro: '', storyContent: '' },
                    slides: slideItems,
                    pptx: prev.pptx ? { ...prev.pptx, title } : null,
                  }));
                  if (!panelOpen) setPanelOpen(true);
                  updated = true;
                }
                if (parsed.slide_update) {
                  // Single slide update — merge into existing slides
                  const s = parsed.slide_update;
                  const updatedSlide: SlideItem = {
                    id: `slide-${s.number}`,
                    number: s.number,
                    title: s.title,
                    keyMessage: s.keyMessage || '',
                    layout: (VALID_LAYOUTS.includes(s.layout as SlideLayout) ? s.layout : 'bullets') as SlideLayout,
                    bullets: s.bullets,
                    notes: s.notes || '',
                    icon: s.icon || null,
                    code: null,
                    accent: ACCENT_CYCLE[(s.number - 1) % ACCENT_CYCLE.length],
                  };
                  setSlideWork((prev) => ({
                    ...prev,
                    slides: prev.slides.map((existing) =>
                      existing.number === updatedSlide.number ? updatedSlide : existing
                    ),
                  }));
                  updated = true;
                }
              } catch (e) {
                if (!(e instanceof SyntaxError)) throw e;
              }
            }
          }

          if (updated) {
            // Update global thinking tracker
            if (thinkingContent) {
              setSlideWork((prev) => ({ ...prev, thinking: thinkingContent }));
            }

            // Detect PPTX code in chat stream
            const pptx = detectPptxCode(assistantContent);
            if (pptx) {
              // Use scenario title instead of unreliable code extraction
              pptx.title = scenarioTitle;
              setSlideWork((prev) => ({ ...prev, phase: 'ready', pptx }));
              if (!panelOpen) setPanelOpen(true);
            }

            setMessages([...newMessages, {
              id: assistantId, role: 'assistant',
              content: assistantContent || (thinkingContent ? '...' : ''),
              createdAt: new Date(),
              metadata: {
                ...(thinkingContent ? { thinking: thinkingContent } : {}),
                streaming: true,
              },
            }]);
          }
        }
      }

      // Finalize
      const finalContent = assistantContent || '(empty response)';
      setMessages([...newMessages, {
        id: assistantId, role: 'assistant', content: finalContent,
        createdAt: new Date(),
        metadata: thinkingContent ? { thinking: thinkingContent } : undefined,
      }]);
      setSlideWork((prev) => ({ ...prev, isStreaming: false }));

      // Final PPTX code detection
      const pptx = detectPptxCode(finalContent);
      if (pptx) {
        pptx.title = scenarioTitle;
        setSlideWork((prev) => ({ ...prev, phase: 'ready', pptx }));
      }
    } catch (error) {
      setMessages([...newMessages, {
        id: crypto.randomUUID(), role: 'error',
        content: error instanceof Error ? error.message : 'Unknown error',
        createdAt: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-2.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: 'var(--accent)' }}>
            <Star size={16} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Copilot SDK Agent</h1>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>AI Presentation Generator</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ModelSelector value={selectedModel} onChange={setSelectedModel} disabled={isLoading} />
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
            style={{ color: 'var(--text-secondary)' }}
            title={panelOpen ? 'パネルを閉じる' : 'パネルを開く'}
          >
            {panelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
      </header>

      {/* Two-pane body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat pane — narrower when panel open to give workspace more room */}
        <div className={`flex flex-col ${panelOpen ? 'w-[35%] min-w-[320px] border-r' : 'w-full'}`} style={{ borderColor: 'var(--border)' }}>
          <main className="flex-1 overflow-hidden">
            <MessageList messages={messages} isLoading={isLoading} />
          </main>
          <footer className="border-t" style={{ borderColor: 'var(--border)' }}>
            <MessageInput onSend={handleSendMessage} disabled={isLoading} />
          </footer>
        </div>

        {/* Slide panel — takes remaining space */}
        {panelOpen && (
          <div className="flex-1" style={{ background: 'var(--background)' }}>
            <SlidePanel slideWork={slideWork} />
          </div>
        )}
      </div>
    </div>
  );
}
