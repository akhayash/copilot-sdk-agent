/**
 * Domain Entity: Slide Work
 * Represents the current slide workspace state.
 */

export interface SlideStory {
  intro: string;
  storyContent: string;
}

export interface SlideCode {
  title: string;
  code: string;
}

/** Per-slide structured data for preview + editing */
export interface SlideItem {
  id: string;
  number: number;
  title: string;
  /** Bullet points / content items parsed from story */
  bullets: string[];
  /** Speaker notes / detailed description */
  notes: string;
  /** Raw story markdown for this slide */
  rawStory: string;
  /** Per-slide pptxgenjs code (when available) */
  code: string | null;
  /** Visual style hint from content analysis */
  accent: 'blue' | 'green' | 'purple' | 'teal' | 'orange';
}

export type SlidePhase = 'empty' | 'planning' | 'story' | 'generating' | 'ready';

export interface SlideWork {
  phase: SlidePhase;
  story: SlideStory | null;
  /** Parsed per-slide items for preview */
  slides: SlideItem[];
  pptx: SlideCode | null;
  /** Latest thinking/reasoning content from AI (always tracks most recent) */
  thinking: string | null;
  /** Whether the AI is currently streaming */
  isStreaming: boolean;
}
