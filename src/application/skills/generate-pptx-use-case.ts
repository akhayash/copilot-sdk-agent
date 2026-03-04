/**
 * Application Layer: Generate PPTX Use Case
 */

import type { AIPresentationOutput } from '../../domain/entities/presentation';
import type { IPptxSkill } from '../../domain/ports/skills/pptx-skill';

export class GeneratePptxUseCase {
  constructor(private pptxSkill: IPptxSkill) {}

  /**
   * Generate PPTX from AI output
   */
  async generate(aiOutput: AIPresentationOutput): Promise<ArrayBuffer> {
    // Validate AI output structure
    if (!aiOutput.slides || !Array.isArray(aiOutput.slides) || aiOutput.slides.length === 0) {
      throw new Error('Invalid presentation structure: slides array is required and must not be empty');
    }

    // Execute skill
    return this.pptxSkill.execute(aiOutput);
  }
}
