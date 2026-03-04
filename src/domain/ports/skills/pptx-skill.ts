/**
 * Domain Port: PPTX Skill
 * Abstraction for PPTX generation
 */

import type { Presentation, AIPresentationOutput } from '../../entities/presentation';

export type PptxSkillInput = AIPresentationOutput;
export type PptxSkillOutput = ArrayBuffer; // Binary PPTX file

export interface IPptxSkill {
  name: string;
  description: string;
  execute(input: PptxSkillInput): Promise<PptxSkillOutput>;
  /**
   * Convert AI output to domain Presentation
   */
  parsePresentation(input: AIPresentationOutput): Presentation;
}
