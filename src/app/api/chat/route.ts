/**
 * API Route: Chat with SSE Streaming
 * POST /api/chat
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getCopilotClient, getSessionOptions } from '@/infrastructure/copilot/client';
import { ChatUseCase } from '@/application/chat-use-case';
import { createScenarioTool, createUpdateSlideTool } from '@/infrastructure/tools/scenario-tool';
import {
  createGenerateSlideImageTool,
  createGenerateAllImagesTool,
} from '@/infrastructure/tools/image-tool';
import { getImageClient } from '@/infrastructure/image/azure-image-client';
import type {
  SessionConfig,
  PermissionHandler,
  MCPServerConfig,
  MCPRemoteServerConfig,
} from '@github/copilot-sdk';
import type { DesignBrief, SlideItem } from '@/domain/entities/slide-work';

type ReasoningEffort = NonNullable<SessionConfig['reasoningEffort']>;
type GenerationMode = 'code' | 'image-then-pptx' | 'image-bleed' | 'image-editable';

const VALID_REASONING_EFFORTS: readonly ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh'];
const VALID_GENERATION_MODES: readonly GenerationMode[] = ['code', 'image-then-pptx', 'image-bleed', 'image-editable'];

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && VALID_REASONING_EFFORTS.includes(value as ReasoningEffort);
}

function isGenerationMode(value: unknown): value is GenerationMode {
  return typeof value === 'string' && VALID_GENERATION_MODES.includes(value as GenerationMode);
}

function isImageMode(mode: GenerationMode): boolean {
  return mode === 'image-then-pptx' || mode === 'image-bleed' || mode === 'image-editable';
}

interface ChatRequest {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  generationMode?: GenerationMode;
  workspace?: {
    title: string;
    slides: SlideItem[];
    designBrief: DesignBrief | null;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequest;
    const { message, history, model, reasoningEffort, workspace } = body;
    const generationMode: GenerationMode = isGenerationMode(body.generationMode)
      ? body.generationMode
      : 'code';

    // Validate input
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required and must be non-empty' }, { status: 400 });
    }
    if (reasoningEffort && !isReasoningEffort(reasoningEffort)) {
      return NextResponse.json({ error: 'Invalid reasoning effort' }, { status: 400 });
    }
    if (body.generationMode !== undefined && !isGenerationMode(body.generationMode)) {
      return NextResponse.json({ error: 'Invalid generationMode' }, { status: 400 });
    }

    // Build prompt
    const prompt = ChatUseCase.buildPrompt(message, history, workspace);

    // Initialize copilot client
    const copilot = await getCopilotClient();
    const sessionOpts = await getSessionOptions({ streaming: true, model, reasoningEffort });
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

        const imageEnabled = isImageMode(generationMode) && getImageClient() !== null;
        const emitImageGenerated = (event: {
          slideNumber: number;
          imageId: string;
          imageUrl: string;
          prompt: string;
        }) => {
          const data = JSON.stringify({ image_generated: event });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };
        const imageTools = imageEnabled
          ? [
              createGenerateSlideImageTool(emitImageGenerated),
              createGenerateAllImagesTool(emitImageGenerated),
            ]
          : [];

        const tools = [
          scenarioTool,
          updateSlideTool,
          ...imageTools,
        ];

        // Microsoft Learn MCP server — enables grounding on official Microsoft / Azure docs.
        // Disable by setting MICROSOFT_LEARN_MCP=off.
        const microsoftLearnEnabled =
          (process.env.MICROSOFT_LEARN_MCP ?? 'on').toLowerCase() !== 'off';
        const mcpServers: Record<string, MCPServerConfig> | undefined = microsoftLearnEnabled
          ? {
              'microsoft-learn': {
                type: 'http',
                url: 'https://learn.microsoft.com/api/mcp',
                tools: ['*'],
              } satisfies MCPRemoteServerConfig,
            }
          : undefined;

        try {
          // Skill directories (SKILL.md based) — switch by generation mode
          const skillDirs =
            isImageMode(generationMode)
              ? [
                  path.resolve(process.cwd(), 'skills', 'create-slide-story'),
                  path.resolve(process.cwd(), 'skills', 'pptx-from-image'),
                ]
              : [
                  path.resolve(process.cwd(), 'skills', 'create-slide-story'),
                  path.resolve(process.cwd(), 'skills', 'generate-pptx'),
                ];

          const baseSystemLines = [
            'You are a helpful AI assistant specialized in creating presentations. Always respond in the same language as the user.',
            'SCOPE: You ONLY help with presentation/slide creation tasks. If a user asks you to do anything unrelated to presentations (e.g., create files, run commands, read source code, modify code, access the filesystem, or any general-purpose task), politely decline and redirect them to presentation-related work.',
            'When creating a slide outline, ALWAYS use the set_scenario tool to send the scenario to the workspace panel. Use the optional designBrief to capture the intended tone, density, and visual direction for the later PPTX step.',
            'When generating PPTX, treat slide layout and icon values as hints rather than rigid instructions, and feel free to design a stronger visual composition if it better communicates the approved story.',
            'When the user asks to change a specific slide, use the update_slide tool to update only that slide.',
            'Do NOT output slide listings in the chat message.',
            'NEVER suggest shell commands, file operations, or workarounds to the user. You are a presentation assistant only.',
            microsoftLearnEnabled
              ? 'KNOWLEDGE GROUNDING: When the user asks about Microsoft / Azure topics (e.g., Azure services, .NET, M365, Power Platform, Microsoft Graph), use the Microsoft Learn MCP tools (`microsoft_docs_search`, `microsoft_code_sample_search`, `microsoft_docs_fetch`) to ground slide content in official Microsoft documentation BEFORE calling set_scenario. Prefer search first, then fetch for depth when needed.'
              : '',
          ].filter((s) => s.length > 0);
          const modeSystemLines =
            isImageMode(generationMode)
              ? [
                  imageEnabled
                    ? 'MODE: image-then-pptx. After set_scenario, call generate_all_images to produce illustrations for every slide, then wait for the user to approve before emitting pptxgenjs code.'
                    : 'MODE: image-then-pptx, but image generation is NOT configured on this deployment (AZURE_IMAGE_ENDPOINT is unset). Tell the user image generation is disabled and fall back to the standard code-only flow.',
                  imageEnabled
                    ? 'CRITICAL for image-then-pptx mode: every content slide in set_scenario MUST include a SUBSTANTIAL `bodyMarkdown` of 600-1200 Japanese characters (350-700 English words) per slide, organized into 3-5 paragraphs with concrete numbers, proper nouns, years, sources, and before/after contrasts. Bullets alone — or short 200-300 char bodies — produce generic stock-image results because gpt-image-2 has nothing concrete to compose. Treat bodyMarkdown as a research briefing that gpt-image-2 will read to design the slide. Only title/section divider slides may omit bodyMarkdown.'
                    : '',
                  imageEnabled
                    ? 'When you call update_slide in image-then-pptx mode, ALSO call generate_slide_image for that same slideNumber in the same turn so the illustration stays in sync with the updated content. Always include bodyMarkdown on update_slide as well.'
                    : '',
                ].filter((s) => s.length > 0)
              : [];

          const sessionConfig: SessionConfig = {
            ...sessionOpts,
            tools,
            skillDirectories: skillDirs,
            ...(mcpServers ? { mcpServers } : {}),
            systemMessage: {
              mode: 'append' as const,
              content: [...baseSystemLines, ...modeSystemLines].join(' '),
            },
            onPermissionRequest: ((req) => {
              if (req.kind === 'custom-tool') return { kind: 'approved' };
              // Allow reading SDK tool-output temp files (e.g. web search results)
              if (req.kind === 'read') {
                const filePath = String((req as Record<string, unknown>).path ?? '');
                if (filePath.includes('copilot-tool-output')) return { kind: 'approved' };
              }
              // Allow built-in web_search (bundled MCP) and Microsoft Learn MCP (read-only docs lookup).
              if (req.kind === 'mcp') {
                const serverName = String((req as Record<string, unknown>).serverName ?? '');
                if (serverName === 'microsoft-learn') return { kind: 'approved' };
                if (serverName === 'github-mcp-server-web_search') return { kind: 'approved' };
              }
              // Allow built-in fetch tool for reading the body of pages discovered via web_search.
              if (req.kind === 'url') return { kind: 'approved' };
              console.warn(`[permission] denied ${req.kind}`, req);
              return { kind: 'denied-by-rules' };
            }) satisfies PermissionHandler,
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
