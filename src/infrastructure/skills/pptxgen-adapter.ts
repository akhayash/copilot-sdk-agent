/**
 * Infrastructure Layer: PPTX Skill Implementation
 * Using pptxgenjs library
 */

import PptxGenJS from 'pptxgenjs';
import type { AIPresentationOutput, Presentation, Slide } from '../../domain/entities/presentation';
import type { IPptxSkill, PptxSkillInput, PptxSkillOutput } from '../../domain/ports/skills/pptx-skill';

export class PptxgenAdapter implements IPptxSkill {
  name = 'pptx';
  description = 'Generate PowerPoint presentations from structured slide data';

  async execute(input: PptxSkillInput): Promise<PptxSkillOutput> {
    const prs = new PptxGenJS();

    // Add slides
    input.slides.forEach((slideData, index) => {
      const slide = prs.addSlide();

      // Title
      slide.addText(slideData.title, {
        x: 0.5,
        y: 0.5,
        w: 9,
        h: 1,
        fontSize: 44,
        bold: true,
        color: '2F5496',
      });

      // Bullets
      if (slideData.bullets && slideData.bullets.length > 0) {
        slide.addText(slideData.bullets.map((bullet) => `• ${bullet}`).join('\n'), {
          x: 0.5,
          y: 1.7,
          w: 9,
          h: 4.5,
          fontSize: 18,
          color: '333333',
        });
      }

      // Notes
      if (slideData.notes) {
        slide.addNotes(slideData.notes);
      }
    });

    // Generate PPTX buffer
    return prs.write({ outputType: 'arraybuffer' }) as Promise<PptxSkillOutput>;
  }

  /**
   * Parse AI output to domain Presentation
   */
  parsePresentation(input: AIPresentationOutput): Presentation {
    const slides: Slide[] = input.slides.map((slideData, index) => ({
      id: `slide-${index + 1}`,
      title: {
        text: slideData.title,
        fontSize: 44,
        bold: true,
      },
      bullets: slideData.bullets,
      layout: { type: 'bullet' },
      notes: slideData.notes,
      order: index + 1,
    }));

    return {
      id: `prs-${Date.now()}`,
      metadata: {
        title: input.title,
        author: input.author,
      },
      slides,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

/**
 * Singleton instance
 */
let adapterInstance: PptxgenAdapter | null = null;

export function getPptxgenAdapter(): PptxgenAdapter {
  if (!adapterInstance) {
    adapterInstance = new PptxgenAdapter();
  }
  return adapterInstance;
}
