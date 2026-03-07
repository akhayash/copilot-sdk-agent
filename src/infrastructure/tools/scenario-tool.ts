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
  notes: string;
  icon?: string;
}

export interface ScenarioDesignBrief {
  objective: string;
  audience: string;
  tone: string;
  visualStyle: string;
  colorMood: string;
  density: string;
  layoutApproach: string;
  directions: string[];
}

export interface ScenarioPayload {
  title: string;
  slides: ScenarioSlide[];
  designBrief?: ScenarioDesignBrief;
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
      'Each slide must have a keyMessage (the "so what" / key takeaway), a layout hint, and optionally an icon hint. ' +
      'Available layouts: title, agenda, section, bullets, cards, stats, comparison, timeline, diagram, summary. ' +
      'The layout and icon are guidance for the later PPTX design step, not a rigid rendering contract. ' +
      'When helpful, include a designBrief describing tone, audience, visual style, density, and layout approach. ' +
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
                description: 'Preferred layout direction for later design exploration: title, agenda, section, bullets, cards, stats, comparison, timeline, diagram, summary',
              },
              bullets: {
                type: 'array',
                items: { type: 'string' },
                description: 'Content items for this slide',
              },
              notes: {
                type: 'string',
                description: 'Speaker notes — REQUIRED for EVERY slide, including title and section slides. Write 2-3 sentences of what the presenter should say. Never leave empty or use a dash.',
              },
              icon: {
                type: 'string',
                description: 'Optional icon hint from available set (e.g. brain, cloud, rocket)',
              },
            },
            required: ['number', 'title', 'keyMessage', 'layout', 'bullets', 'notes'],
          },
        },
        designBrief: {
          type: 'object',
          description: 'Optional presentation-wide design intent that guides PPTX generation while leaving room for creative layout decisions.',
          properties: {
            objective: { type: 'string', description: 'What the presentation should feel like strategically or emotionally' },
            audience: { type: 'string', description: 'Primary audience from a design perspective' },
            tone: { type: 'string', description: 'Tone such as executive, bold, premium, playful, analytical' },
            visualStyle: { type: 'string', description: 'Visual metaphor or art direction, e.g. editorial cards, minimalist dashboard, keynote-style hero visuals' },
            colorMood: { type: 'string', description: 'Preferred color mood or contrast profile' },
            density: { type: 'string', description: 'Desired information density, e.g. airy, balanced, dense' },
            layoutApproach: { type: 'string', description: 'How much compositional freedom to take, e.g. structured, hybrid, design-led' },
            directions: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific design directions or constraints for the whole deck',
            },
          },
          required: ['objective', 'audience', 'tone', 'visualStyle', 'colorMood', 'density', 'layoutApproach', 'directions'],
        },
      },
      required: ['title', 'slides'],
    },
    handler: async (args: ScenarioPayload) => {
      onScenario(args);
      return {
        success: true,
        message: `Scenario "${args.title}" set with ${args.slides.length} slides${args.designBrief ? ' and a design brief' : ''}. The user can now review the presentation direction in the workspace panel.`,
      };
    },
  });
}

/**
 * Creates an update_slide tool for updating individual slides.
 * Emits a slide_update SSE event with a single slide's data.
 */
export function createUpdateSlideTool(
  onSlideUpdate: (slide: ScenarioSlide) => void,
) {
  return defineTool('update_slide', {
    description:
      'Update a single slide in the existing scenario. Use this when the user asks to change a specific slide ' +
      '(e.g. "P.10を変更して"). Only the specified slide is updated; other slides remain unchanged.',
    parameters: {
      type: 'object' as const,
      properties: {
        number: { type: 'number', description: 'Slide number to update (1-based)' },
        title: { type: 'string', description: 'Updated slide title' },
        keyMessage: { type: 'string', description: 'Updated key takeaway' },
        layout: { type: 'string', description: 'Layout type' },
        bullets: { type: 'array', items: { type: 'string' }, description: 'Updated content items' },
        notes: { type: 'string', description: 'Speaker notes — required, 2-3 sentences of what to say' },
        icon: { type: 'string', description: 'Updated icon name' },
      },
      required: ['number', 'title', 'keyMessage', 'layout', 'bullets', 'notes'],
    },
    handler: async (args: ScenarioSlide) => {
      onSlideUpdate(args);
      return {
        success: true,
        message: `Slide ${args.number} "${args.title}" updated in the workspace panel.`,
      };
    },
  });
}
