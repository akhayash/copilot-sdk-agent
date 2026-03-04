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

export type SlidePhase = 'empty' | 'planning' | 'story' | 'generating' | 'ready';

export interface SlideWork {
  phase: SlidePhase;
  story: SlideStory | null;
  pptx: SlideCode | null;
}
