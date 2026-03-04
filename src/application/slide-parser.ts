/**
 * Application: Slide Parser
 * Parses AI-generated slide story markdown into structured SlideItem[].
 */

import type { SlideItem } from '@/domain/entities/slide-work';

const SLIDE_HEADING = /(?:^|\n)#{0,4}\s*スライド\s*(\d+)\s*[:：]\s*(.+)/g;
const BULLET_LINE = /^\s*[-*•🔹🔸▸]\s+(.+)/;
const ACCENT_CYCLE: SlideItem['accent'][] = ['blue', 'green', 'purple', 'teal', 'orange'];

/**
 * Parse markdown story content into SlideItem array.
 * Expects format: "### スライド 1: タイトル\n- bullet\n- bullet\n..."
 */
export function parseStoryToSlides(storyContent: string): SlideItem[] {
  const positions: { number: number; title: string; start: number; headEnd: number }[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(SLIDE_HEADING.source, 'g');

  while ((match = re.exec(storyContent)) !== null) {
    positions.push({
      number: parseInt(match[1]),
      title: match[2].trim(),
      start: match.index,
      headEnd: match.index + match[0].length,
    });
  }

  return positions.map((pos, i) => {
    const bodyEnd = i + 1 < positions.length ? positions[i + 1].start : storyContent.length;
    const body = storyContent.slice(pos.headEnd, bodyEnd).trim();
    const lines = body.split('\n');

    const bullets: string[] = [];
    const noteLines: string[] = [];

    for (const line of lines) {
      const bulletMatch = line.match(BULLET_LINE);
      if (bulletMatch) {
        // Clean markdown formatting from bullet text
        const text = bulletMatch[1]
          .replace(/\*\*([^*]+)\*\*/g, '$1')  // bold
          .replace(/\*([^*]+)\*/g, '$1')       // italic
          .replace(/`([^`]+)`/g, '$1')         // code
          .trim();
        if (text) bullets.push(text);
      } else if (line.trim() && !line.match(/^#{1,4}\s/) && !line.match(/^---/)) {
        noteLines.push(line.trim());
      }
    }

    return {
      id: `slide-${pos.number}`,
      number: pos.number,
      title: pos.title.replace(/\*\*/g, ''),
      bullets,
      notes: noteLines.join('\n'),
      rawStory: storyContent.slice(pos.start, bodyEnd).trim(),
      code: null,
      accent: ACCENT_CYCLE[(pos.number - 1) % ACCENT_CYCLE.length],
    };
  });
}

/** Check if content contains slide story pattern (3+ slides) */
export function isSlideStory(content: string): boolean {
  const count = (content.match(/スライド\s*\d+\s*[:：]/g) || []).length;
  return count >= 3;
}

/** Split content into intro (before first slide) and story body */
export function splitStoryContent(content: string): { intro: string; storyContent: string } {
  const first = content.search(/#{0,4}\s*スライド\s*1\s*[:：]/);
  if (first <= 0) return { intro: '', storyContent: content };
  return {
    intro: content.slice(0, first).trim(),
    storyContent: content.slice(first),
  };
}
