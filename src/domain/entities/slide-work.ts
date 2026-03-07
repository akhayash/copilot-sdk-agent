/**
 * Domain Entity: Slide Work
 * Represents the current slide workspace state.
 */

export interface SlideStory {
  intro: string;
  storyContent: string;
}

export interface DesignBrief {
  objective: string;
  audience: string;
  tone: string;
  visualStyle: string;
  colorMood: string;
  density: string;
  layoutApproach: string;
  directions: string[];
}

export interface SlideCode {
  title: string;
  code: string;
}

export type SlideLayout = 'title' | 'agenda' | 'section' | 'bullets' | 'cards' | 'stats' | 'comparison' | 'timeline' | 'diagram' | 'summary';

/** Per-slide structured data for preview + editing */
export interface SlideItem {
  id: string;
  number: number;
  title: string;
  /** The "so what" — key takeaway this slide must communicate */
  keyMessage: string;
  /** Layout type determines visual structure */
  layout: SlideLayout;
  /** Bullet points / content items */
  bullets: string[];
  /** Speaker notes / detailed description */
  notes: string;
  /** Suggested icon name from public/icons/ (e.g. 'brain', 'cloud', 'rocket') */
  icon: string | null;
  /** Per-slide pptxgenjs code (when available) */
  code: string | null;
  /** Visual style hint */
  accent: 'blue' | 'green' | 'purple' | 'teal' | 'orange';
}

export type SlidePhase = 'empty' | 'planning' | 'story' | 'generating' | 'ready';

export interface SlideWork {
  phase: SlidePhase;
  story: SlideStory | null;
  designBrief: DesignBrief | null;
  /** Parsed per-slide items for preview */
  slides: SlideItem[];
  pptx: SlideCode | null;
  /** Latest thinking/reasoning content from AI (always tracks most recent) */
  thinking: string | null;
  /** Whether the AI is currently streaming */
  isStreaming: boolean;
}
