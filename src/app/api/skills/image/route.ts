/**
 * API Route: Image Generation Skill
 * POST /api/skills/image
 *
 * Generates a single image via Azure Foundry and caches it in-memory.
 * Returns metadata pointing at the binary GET endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateImage, getImageClient } from '@/infrastructure/image/azure-image-client';
import { putImage } from '@/infrastructure/image/image-cache';

interface ImageGenRequest {
  slideNumber: number;
  prompt: string;
}

export async function POST(req: NextRequest) {
  try {
    if (!getImageClient()) {
      return NextResponse.json(
        {
          error:
            'Image generation is not configured on this deployment. Set AZURE_IMAGE_ENDPOINT to enable.',
        },
        { status: 503 },
      );
    }

    const body = (await req.json()) as ImageGenRequest;
    const { slideNumber, prompt } = body;

    if (typeof slideNumber !== 'number' || !Number.isInteger(slideNumber) || slideNumber < 1) {
      return NextResponse.json(
        { error: 'slideNumber is required and must be a positive integer' },
        { status: 400 },
      );
    }
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'prompt is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    const [first] = await generateImage(prompt, { size: '1536x1024', n: 1 });
    if (!first) {
      return NextResponse.json({ error: 'No image returned by upstream model' }, { status: 502 });
    }

    const imageId = putImage(first.data, first.mimeType);
    return NextResponse.json({
      imageId,
      slideNumber,
      imageUrl: `/api/skills/image/${imageId}`,
      prompt,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to generate image';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
