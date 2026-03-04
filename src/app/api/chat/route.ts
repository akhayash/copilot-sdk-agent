/**
 * API Route: Chat with SSE Streaming
 * POST /api/chat
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getCopilotClient, getSessionOptions } from '@/infrastructure/copilot/client';
import { ChatUseCase } from '@/application/chat-use-case';
import { webSearchTool } from '@/infrastructure/tools/web-search-tool';
import { createScenarioTool, createUpdateSlideTool } from '@/infrastructure/tools/scenario-tool';
import type { SessionConfig } from '@github/copilot-sdk';
import { approveAll } from '@github/copilot-sdk';

interface ChatRequest {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  model?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequest;
    const { message, history, model } = body;

    // Validate input
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required and must be non-empty' }, { status: 400 });
    }

    // Build prompt
    const prompt = ChatUseCase.buildPrompt(message, history);

    // Initialize copilot client
    const copilot = await getCopilotClient();
    const sessionOpts = await getSessionOptions({ streaming: true, model });
    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let session: Awaited<ReturnType<typeof copilot.createSession>> | null = null;
        let unsubMessages: (() => void) | null = null;
        let unsubReasoning: (() => void) | null = null;
        let unsubError: (() => void) | null = null;
        let keepalive: ReturnType<typeof setInterval> | null = null;

        // Build custom tools (scenario tool needs controller for SSE)
        const scenarioTool = createScenarioTool((payload) => {
          const data = JSON.stringify({ scenario: payload });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        });
        const updateSlideTool = createUpdateSlideTool((slide) => {
          const data = JSON.stringify({ slide_update: slide });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        });
        const tools = [scenarioTool, updateSlideTool, ...(process.env.TAVILY_API_KEY ? [webSearchTool] : [])];

        try {
          // Skill directories (SKILL.md based)
          const skillDirs = [
            path.resolve(process.cwd(), 'skills', 'create-slide-story'),
            path.resolve(process.cwd(), 'skills', 'generate-pptx'),
          ];

          const sessionConfig: SessionConfig = {
            ...sessionOpts,
            tools,
            skillDirectories: skillDirs,
            systemMessage: {
              mode: 'append' as const,
              content: 'You are a helpful AI assistant that creates presentations. Always respond in the same language as the user. When creating a slide outline, ALWAYS use the set_scenario tool to send the scenario to the workspace panel. When the user asks to change a specific slide, use the update_slide tool to update only that slide. Do NOT output slide listings in the chat message.',
            },
            onPermissionRequest: approveAll,
          };

          // Create session
          session = await copilot.createSession(sessionConfig);

          // Keepalive ping to prevent idle timeout
          keepalive = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(': keepalive\n\n'));
            } catch { /* stream already closed */ }
          }, 30_000);

          // Subscribe to reasoning deltas (thinking)
          unsubReasoning = session.on('assistant.reasoning_delta', (event) => {
            const delta = event.data?.deltaContent ?? '';
            if (delta) {
              const data = JSON.stringify({ thinking: delta });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          });

          // Subscribe to message deltas
          unsubMessages = session.on('assistant.message_delta', (event) => {
            const delta = event.data?.deltaContent ?? '';
            if (delta) {
              const data = JSON.stringify({ content: delta });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          });

          // Subscribe to errors
          unsubError = session.on('session.error', (event) => {
            const msg = event.data?.message ?? 'Unknown error';
            const errorData = JSON.stringify({ error: msg });
            controller.enqueue(encoder.encode(`event: error\ndata: ${errorData}\n\n`));
          });

          // Send message and wait for completion (10 min timeout)
          await session.sendAndWait({ prompt }, 600_000);

          clearInterval(keepalive);

          // Signal completion
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          if (keepalive) clearInterval(keepalive);
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          const errorData = JSON.stringify({ error: errorMsg });
          controller.enqueue(encoder.encode(`event: error\ndata: ${errorData}\n\n`));
          controller.close();
        } finally {
          if (keepalive) clearInterval(keepalive);
          unsubMessages?.();
          unsubReasoning?.();
          unsubError?.();
          if (session) {
            await session.destroy();
          }
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
