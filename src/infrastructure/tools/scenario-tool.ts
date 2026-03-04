/**
 * Infrastructure Layer: Scenario Tool for Copilot SDK
 * Allows the AI to set slide scenarios directly into the workspace panel
 * via structured tool calls instead of outputting markdown in chat.
 */

import { defineTool } from '@github/copilot-sdk';

export interface ScenarioSlide {
  number: number;
  title: string;
  bullets: string[];
  notes?: string;
}

export interface ScenarioPayload {
  title: string;
  slides: ScenarioSlide[];
}

/**
 * Creates a set_scenario tool that emits SSE events to the stream controller.
 * Must be created per-request since it closes over the SSE controller.
 */
export function createScenarioTool(
  onScenario: (payload: ScenarioPayload) => void,
) {
  return defineTool('set_scenario', {
    description:
      'Set the slide scenario (outline) for the presentation workspace panel. ' +
      'Call this tool with the presentation title and an array of slides. ' +
      'Each slide has a number, title, and bullet points. ' +
      'The scenario will appear in the right-side workspace panel for user review.',
    parameters: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Presentation title',
        },
        slides: {
          type: 'array',
          description: 'Array of slide definitions',
          items: {
            type: 'object',
            properties: {
              number: { type: 'number', description: 'Slide number (1-based)' },
              title: { type: 'string', description: 'Slide title' },
              bullets: {
                type: 'array',
                items: { type: 'string' },
                description: 'Bullet points for this slide',
              },
              notes: {
                type: 'string',
                description: 'Optional speaker notes or detailed description',
              },
            },
            required: ['number', 'title', 'bullets'],
          },
        },
      },
      required: ['title', 'slides'],
    },
    handler: async (args: ScenarioPayload) => {
      onScenario(args);
      return {
        success: true,
        message: `Scenario "${args.title}" set with ${args.slides.length} slides. The user can now see the outline in the workspace panel.`,
      };
    },
  });
}
