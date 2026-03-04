/**
 * Domain Entity: Presentation
 * Represents a PowerPoint presentation structure
 */

export interface PresentationMetadata {
  title: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  theme?: string;
}

export interface SlideLayout {
  type: 'title' | 'bullet' | 'two-column' | 'image' | 'custom';
  backgroundColor?: string;
  textColor?: string;
}

export interface TextElement {
  text: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

export interface Slide {
  id: string;
  title: TextElement;
  content?: TextElement[];
  bullets?: string[];
  layout: SlideLayout;
  notes?: string;
  order: number;
}

export interface Presentation {
  id: string;
  metadata: PresentationMetadata;
  slides: Slide[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Raw JSON structure that AI generates
 * This is what the Copilot SDK will output
 */
export interface AIPresentationOutput {
  title: string;
  author?: string;
  slides: Array<{
    title: string;
    bullets?: string[];
    notes?: string;
  }>;
}
