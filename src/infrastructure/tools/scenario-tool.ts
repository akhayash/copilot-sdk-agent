/**
 * Infrastructure Layer: Scenario Tool for Copilot SDK
 * Allows the AI to set slide scenarios directly into the workspace panel
 * via structured tool calls instead of outputting markdown in chat.
 */

import { defineTool } from '@github/copilot-sdk';

export interface ScenarioSlide {
  number: number;
  title: string;
  keyMessage: string;
  layout: string;
  bullets: string[];
  notes?: string;
  icon?: string;
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
      'Each slide must have a keyMessage (the "so what" / key takeaway), a layout type, and optionally an icon. ' +
      'Available layouts: title, agenda, section, bullets, cards, stats, comparison, timeline, diagram, summary. ' +
      'Available icons: arrow-trending-up, brain, building, calendar, chart, checkmark-circle, cloud, code, data-trending, document, globe, lightbulb, link, lock-closed, money, people-team, rocket, search, settings, shield, sparkle, star, target, warning.',
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
              title: { type: 'string', description: 'Slide title — concise heading' },
              keyMessage: { type: 'string', description: 'The "so what" — the single key takeaway this slide must communicate to the audience' },
              layout: {
                type: 'string',
                description: 'Layout type: title, agenda, section, bullets, cards, stats, comparison, timeline, diagram, summary',
              },
              bullets: {
                type: 'array',
                items: { type: 'string' },
                description: 'Content items for this slide',
              },
              notes: {
                type: 'string',
                description: 'Speaker notes with detailed context',
              },
              icon: {
                type: 'string',
                description: 'Icon name from available set (e.g. brain, cloud, rocket)',
              },
            },
            required: ['number', 'title', 'keyMessage', 'layout', 'bullets'],
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
