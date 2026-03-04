/**
 * Application Layer: Chat Use Case
 * Orchestrates chat conversation with Copilot SDK
 */

import type { Message, Attachment, ChatHistory } from '../domain/entities/message';

export interface ChatRequest {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  attachments?: Attachment[];
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
  ): string {
    const historyLines = history ? history.map((m) => `${m.role}: ${m.content}`).join('\n') : '';
    return historyLines ? `${historyLines}\n\nuser: ${message}` : message;
  }
}
