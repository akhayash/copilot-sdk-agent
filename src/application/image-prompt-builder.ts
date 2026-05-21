/**
 * Application Layer: Image Prompt Builder
 *
 * Composes an English prompt for gpt-image-2 that produces a **complete,
 * professional 16:9 presentation slide in one shot**, with Japanese text
 * rendered accurately on the image itself.
 *
 * Design philosophy (revised):
 *   - The scenario `bodyMarkdown` / bullets / notes are passed as **research
 *     context / briefing material**, NOT as literal strings to render.
 *     gpt-image-2 decides which numbers, phrases and structure to feature.
 *   - We DO want text in the image (titles, key stats, bullet labels, source
 *     captions). No "no text" prohibition.
 *   - We DO want logos/charts/icons when the layout calls for them.
 *   - Output is a single self-contained slide that can be dropped onto a
 *     16:9 PPTX page as-is.
 *
 * Framework-agnostic so it can be imported from both server and client code.
 */

import type { DesignBrief, SlideItem, SlideLayout } from '../domain/entities/slide-work';

const MAX_BODY_CHARS = 1600;
const MAX_BULLETS = 8;

function trimTo(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function collectContext(slide: SlideItem): string[] {
  const bits: string[] = [];
  if (slide.bodyMarkdown && slide.bodyMarkdown.trim().length > 0) {
    const md = slide.bodyMarkdown.trim();
    bits.push(
      `Research notes (markdown):\n${md.length > MAX_BODY_CHARS ? `${md.slice(0, MAX_BODY_CHARS - 1)}…` : md}`,
    );
  }
  if (slide.bullets.length > 0) {
    const lines = slide.bullets.slice(0, MAX_BULLETS).map((b) => `- ${b}`);
    bits.push(`Key facts:\n${lines.join('\n')}`);
  }
  if (slide.notes && slide.notes.trim().length > 0) {
    bits.push(`Presenter intent: ${trimTo(slide.notes, 300)}`);
  }
  return bits;
}

function describeStyle(brief: DesignBrief | null): string {
  if (!brief) {
    return 'clean, professional, modern editorial slide design with strong typographic hierarchy';
  }
  const fragments = [
    brief.tone,
    brief.visualStyle,
    brief.colorMood ? `${brief.colorMood} color palette` : null,
    brief.density ? `${brief.density} information density` : null,
  ].filter((s): s is string => Boolean(s && s.trim().length > 0));
  if (fragments.length === 0) {
    return 'clean, professional, modern editorial slide design';
  }
  return fragments.join(', ');
}

function layoutGuidance(layout: SlideLayout): string {
  switch (layout) {
    case 'title':
      return 'Layout: title slide. Hero title centered or upper-left, short subtitle below, optional decorative graphic on the right. Generous whitespace.';
    case 'agenda':
      return 'Layout: agenda. Numbered list of 3–6 sections on the left, large section index on the right. Clean grid.';
    case 'section':
      return 'Layout: section divider. Oversized section number and short title, minimal decoration, strong color block.';
    case 'bullets':
      return 'Layout: bullet content. Slide title at top, 3–6 bullet points with consistent indentation, optional small illustration on the right.';
    case 'cards':
      return 'Layout: 3–4 card grid. Each card has an icon, short heading, and 1–2 sentence body. Equal sizing.';
    case 'stats':
      return 'Layout: statistics hero. One or two oversized numbers featured prominently with short labels and context lines. Source caption in small type at the bottom.';
    case 'comparison':
      return 'Layout: side-by-side comparison. Two columns (or before/after) with parallel headings and bullet lists; subtle divider in the middle.';
    case 'timeline':
      return 'Layout: horizontal timeline. 3–6 milestones along a baseline with year/label and short caption above each node.';
    case 'diagram':
      return 'Layout: diagram. Boxes / nodes connected by arrows showing flow or relationships, with clear labels.';
    case 'summary':
      return 'Layout: closing summary. 3 short takeaways stacked vertically, larger call-to-action at the bottom.';
    default:
      return 'Layout: clear hierarchy with a slide title at the top and supporting content below.';
  }
}

/**
 * Build a fresh image prompt that asks gpt-image-2 to render a complete 16:9
 * presentation slide — including Japanese text — in one shot.
 */
export function buildImagePrompt(slide: SlideItem, brief: DesignBrief | null): string {
  const title = slide.title.trim();
  const keyMessage = slide.keyMessage.trim();
  const style = describeStyle(brief);
  const audience = brief?.audience?.trim();
  const objective = brief?.objective?.trim();
  const directions = brief?.directions?.filter((d) => d && d.trim().length > 0) ?? [];
  const context = collectContext(slide);

  const parts: string[] = [
    'You are designing ONE complete 16:9 presentation slide (aspect ratio 3:2 acceptable, fill the canvas).',
    `Slide title (render verbatim in Japanese): 「${title}」`,
    `Key takeaway (render verbatim as the slide's hero message in Japanese): 「${keyMessage}」`,
    layoutGuidance(slide.layout),
    `Visual style: ${style}.`,
    objective ? `Deck objective: ${objective}.` : null,
    audience ? `Audience: ${audience}.` : null,
    directions.length > 0 ? `Design directives: ${directions.join('; ')}.` : null,
    context.length > 0
      ? `\n--- Research context (use this material to decide what to feature; you choose which numbers, phrases, charts, or icons to render — do NOT copy the markdown verbatim) ---\n${context.join('\n\n')}`
      : null,
    '\nRendering requirements:',
    '- Compose the slide layout yourself — title, body, bullets, callouts, charts, icons, source caption, etc. — as a real presentation designer would.',
    '- Render all on-slide text in clean, professional Japanese typography. Numbers and English brand names stay in their original script.',
    '- Use a clear typographic hierarchy (hero number / title / body / footnote).',
    '- Include a small source caption at the bottom if research notes reference sources.',
    '- Background, color palette, and accents should match the visual style above.',
    '- Output must be ONE complete slide. No multi-panel collages, no mockup frames, no laptop/phone bezels, no presenter photos.',
  ].filter((p): p is string => p !== null);

  return parts.join('\n');
}

/**
 * Returns the prompt that should actually be sent to the image API for this
 * slide. If the slide already carries an `imagePrompt` (e.g. user edited it,
 * or this is a regeneration), reuse it; otherwise build a fresh prompt.
 */
export function getEffectivePrompt(slide: SlideItem, brief: DesignBrief | null): string {
  if (slide.imagePrompt && slide.imagePrompt.trim().length > 0) {
    return slide.imagePrompt;
  }
  return buildImagePrompt(slide, brief);
}
