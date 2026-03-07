/**
 * Application Layer: Chat Use Case
 * Orchestrates chat conversation with Copilot SDK
 */

import type { Message, Attachment, ChatHistory } from '../domain/entities/message';
import type { DesignBrief, SlideItem } from '../domain/entities/slide-work';

export interface ChatRequest {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  attachments?: Attachment[];
  workspace?: {
    title: string;
    slides: SlideItem[];
    designBrief: DesignBrief | null;
  };
}

export interface ChatResponse {
  message: string;
  role: 'assistant';
  id: string;
  createdAt: Date;
}

export class ChatUseCase {
  /**
   * Build a system prompt with available skills
   */
  static buildSystemPrompt(skillsInfo: Array<{ name: string; description: string }>): string {
    const skillsDescription = skillsInfo
      .map((skill) => `- ${skill.name}: ${skill.description}`)
      .join('\n');

    return `You are a helpful AI assistant that can help users create presentations.

Available Skills:
${skillsDescription}

When generating slides, output a valid JSON with the following format for the PPTX skill:
\`\`\`json
{
  "title": "Presentation Title",
  "author": "Your Name",
  "slides": [
    {
      "title": "Slide Title",
      "bullets": ["Point 1", "Point 2", "Point 3"],
      "notes": "Optional speaker notes"
    }
  ]
}
\`\`\`

Always wrap JSON output in a code block with \`\`\`json markers.`;
  }

  /**
   * Extract JSON from AI response
   */
  static extractJSON(response: string): unknown | null {
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      return null;
    }
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (error) {
      return null;
    }
  }

  /**
   * Build prompt from message and history
   */
  static buildPrompt(
    message: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
    workspace?: {
      title: string;
      slides: SlideItem[];
      designBrief: DesignBrief | null;
    },
  ): string {
    const historyLines = history ? history.map((m) => `${m.role}: ${m.content}`).join('\n') : '';
    const workspaceContext = workspace && (workspace.slides.length > 0 || workspace.designBrief)
      ? [
          'approved-workspace:',
          '```json',
          JSON.stringify({
            title: workspace.title,
            designBrief: workspace.designBrief,
            slides: workspace.slides.map((slide) => ({
              number: slide.number,
              title: slide.title,
              keyMessage: slide.keyMessage,
              layout: slide.layout,
              bullets: slide.bullets,
              notes: slide.notes,
              icon: slide.icon,
            })),
          }, null, 2),
          '```',
          'Use this approved workspace as the current presentation source of truth. You may reinterpret layout hints creatively when generating PPTX, but preserve the core story unless the user asks to change it.',
        ].join('\n')
      : '';

    return [historyLines, workspaceContext, `user: ${message}`].filter(Boolean).join('\n\n');
  }
}
