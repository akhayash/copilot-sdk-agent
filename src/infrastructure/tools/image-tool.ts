/**
 * Infrastructure Layer: Image Generation Tools for Copilot SDK
 *
 * Two custom tools that let the AI request slide images:
 *   - generate_slide_image: produce a single image for one slide
 *   - generate_all_images:  produce images for many slides in parallel
 *     (bounded concurrency to respect API rate limits)
 *
 * Both follow the same factory pattern as `scenario-tool.ts`: a per-request
 * factory closes over an `onImageGenerated` callback so the chat route can
 * forward image-ready events to the SSE stream.
 */

import { defineTool } from '@github/copilot-sdk';

import { generateImage, getImageClient, type ImageSize } from '../image/azure-image-client';
import { putImage } from '../image/image-cache';

/** Concurrency cap for batch generation to stay within Foundry rate limits. */
const BATCH_CONCURRENCY = 3;

/** Allowed sizes — keep in sync with `ImageSize` in azure-image-client. */
const ALLOWED_SIZES: ReadonlyArray<ImageSize> = ['1024x1024', '1536x1024', '1024x1536'];

function normalizeSize(size: string | undefined): ImageSize {
  if (size && (ALLOWED_SIZES as readonly string[]).includes(size)) {
    return size as ImageSize;
  }
  // Default to 1536x1024 (3:2, closest to 16:9 among gpt-image-2 sizes).
  return '1536x1024';
}

export interface ImageGeneratedEvent {
  slideNumber: number;
  imageId: string;
  imageUrl: string;
  prompt: string;
}

interface SingleImageArgs {
  slideNumber: number;
  prompt: string;
  size?: string;
}

interface BatchImageArgs {
  slides: Array<{ slideNumber: number; prompt: string; size?: string }>;
}

async function generateOne(
  slideNumber: number,
  prompt: string,
  size: ImageSize,
  emit: (event: ImageGeneratedEvent) => void,
): Promise<ImageGeneratedEvent> {
  const [first] = await generateImage(prompt, { size, n: 1 });
  if (!first) {
    throw new Error(`No image returned for slide ${slideNumber}`);
  }
  const imageId = putImage(first.data, first.mimeType);
  const event: ImageGeneratedEvent = {
    slideNumber,
    imageId,
    imageUrl: `/api/skills/image/${imageId}`,
    prompt,
  };
  emit(event);
  return event;
}

/**
 * Creates a tool that generates exactly one slide image.
 * Emits an `ImageGeneratedEvent` via `onImageGenerated` on success.
 */
export function createGenerateSlideImageTool(
  onImageGenerated: (event: ImageGeneratedEvent) => void,
) {
  return defineTool('generate_slide_image', {
    description:
      'Generate ONE complete 16:9 presentation slide as a single image using Azure Foundry gpt-image-2. ' +
      'The image must be a finished slide — title, hero message, body/bullets/charts/icons, source caption — ' +
      'rendered with accurate Japanese typography. The scenario bodyMarkdown / bullets / notes are RESEARCH ' +
      'CONTEXT for the visual composition, NOT literal strings to copy. The model decides which numbers, ' +
      'phrases and structure to feature.',
    parameters: {
      type: 'object' as const,
      properties: {
        slideNumber: {
          type: 'number',
          description: 'Slide number (1-based) the image belongs to',
        },
        prompt: {
          type: 'string',
          description:
            'English prompt describing a complete 16:9 slide. Include the Japanese title and key message verbatim ' +
            '(in 「」 quotes), then research context the model should use to compose the slide. Specify layout type, ' +
            'visual style, palette, and that text must be rendered in accurate Japanese typography.',
        },
        size: {
          type: 'string',
          description: `Optional image size. One of: ${ALLOWED_SIZES.join(', ')}. Defaults to 1536x1024 (closest to 16:9).`,
        },
      },
      required: ['slideNumber', 'prompt'],
    },
    handler: async (args: SingleImageArgs) => {
      if (!getImageClient()) {
        return {
          success: false,
          message:
            'Image generation is not configured on this deployment. Set AZURE_IMAGE_ENDPOINT to enable.',
        };
      }
      try {
        const event = await generateOne(
          args.slideNumber,
          args.prompt,
          normalizeSize(args.size),
          onImageGenerated,
        );
        return {
          success: true,
          imageId: event.imageId,
          imageUrl: event.imageUrl,
          slideNumber: event.slideNumber,
          message: `Image for slide ${event.slideNumber} generated successfully.`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          slideNumber: args.slideNumber,
          message: `Image generation failed for slide ${args.slideNumber}: ${message}`,
        };
      }
    },
  });
}

/**
 * Creates a tool that generates images for many slides at once.
 * Concurrency is bounded by `BATCH_CONCURRENCY` to respect rate limits.
 * Each completion fires `onImageGenerated` so the UI can update incrementally.
 */
export function createGenerateAllImagesTool(
  onImageGenerated: (event: ImageGeneratedEvent) => void,
) {
  return defineTool('generate_all_images', {
    description:
      'Generate complete 16:9 slide images for many slides in one call. Each image is a finished slide ' +
      '(title + content + source caption) with accurate Japanese typography. Use after the scenario has been ' +
      'set and the user wants every slide rendered. Each successful image is reported to the workspace panel ' +
      'incrementally; the final tool result summarizes successes and failures.',
    parameters: {
      type: 'object' as const,
      properties: {
        slides: {
          type: 'array',
          description: 'List of slides to generate images for',
          items: {
            type: 'object',
            properties: {
              slideNumber: { type: 'number', description: 'Slide number (1-based)' },
              prompt: {
                type: 'string',
                description:
                  'English prompt describing a complete 16:9 slide for this slide number, with Japanese title and ' +
                  'key message verbatim and research context for composition.',
              },
              size: {
                type: 'string',
                description: `Optional image size. One of: ${ALLOWED_SIZES.join(', ')}.`,
              },
            },
            required: ['slideNumber', 'prompt'],
          },
        },
      },
      required: ['slides'],
    },
    handler: async (args: BatchImageArgs) => {
      if (!getImageClient()) {
        return {
          success: false,
          message:
            'Image generation is not configured on this deployment. Set AZURE_IMAGE_ENDPOINT to enable.',
        };
      }

      const tasks = [...args.slides];
      const results: Array<{ slideNumber: number; imageId?: string; error?: string }> = [];

      async function worker(): Promise<void> {
        while (tasks.length > 0) {
          const next = tasks.shift();
          if (!next) {
            return;
          }
          try {
            const event = await generateOne(
              next.slideNumber,
              next.prompt,
              normalizeSize(next.size),
              onImageGenerated,
            );
            results.push({ slideNumber: event.slideNumber, imageId: event.imageId });
          } catch (err) {
            results.push({
              slideNumber: next.slideNumber,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      const workers = Array.from(
        { length: Math.min(BATCH_CONCURRENCY, args.slides.length) },
        () => worker(),
      );
      await Promise.all(workers);

      const successes = results.filter((r) => r.imageId).length;
      const failures = results.length - successes;
      return {
        success: failures === 0,
        results,
        message:
          failures === 0
            ? `Generated ${successes} image${successes === 1 ? '' : 's'}.`
            : `Generated ${successes} image(s); ${failures} failed. See results for details.`,
      };
    },
  });
}
