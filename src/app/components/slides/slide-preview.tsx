/**
 * UI Component: Slide SVG Preview
 * Renders a visual slide preview using SVG with the design system colors.
 * Mimics pptxgenjs LAYOUT_WIDE (13.33 x 7.5 inches → 16:9-ish ratio).
 */

'use client';

import React from 'react';
import type { SlideItem } from '@/domain/entities/slide-work';

// Design system colors matching pptxgenjs constants
const COLORS = {
  blue: { primary: '#0078D4', light: '#DEECF9', pale: '#EBF3FC' },
  green: { primary: '#107C10', light: '#DFF6DD', pale: '#E8F6E8' },
  purple: { primary: '#5C2D91', light: '#F0E6F6', pale: '#F5EEFA' },
  teal: { primary: '#008272', light: '#D4F1ED', pale: '#E6F7F5' },
  orange: { primary: '#D83B01', light: '#FFF4CE', pale: '#FFF8E6' },
};

const DARK = '#1B1B1B';
const TEXT_COLOR = '#3B3B3B';
const MID_GRAY = '#505050';
const BORDER = '#E1E1E1';

// SVG viewBox: 400x250 (16:10 ratio)
const W = 400;
const H = 250;
const PAD = 20;

interface SlidePreviewProps {
  slide: SlideItem;
  /** Whether this is a title slide (slide 1) */
  isTitle?: boolean;
  className?: string;
}

export function SlidePreview({ slide, isTitle, className }: SlidePreviewProps) {
  const palette = COLORS[slide.accent] || COLORS.blue;

  if (isTitle) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`Slide ${slide.number}: ${slide.title}`}>
        {/* Background */}
        <rect width={W} height={H} fill="white" rx="4" />
        {/* Accent bar */}
        <rect x="0" y="0" width="6" height={H} fill={palette.primary} rx="3" />
        {/* Decorative shape */}
        <rect x={W - 100} y="0" width="100" height={H} fill={palette.pale} opacity="0.7" />
        <circle cx={W - 40} cy={H / 2} r="30" fill={palette.light} />
        {/* Title */}
        <text x={PAD + 10} y={H * 0.38} fontSize="18" fontWeight="700" fill={DARK} fontFamily="sans-serif">
          {truncate(slide.title, 28)}
        </text>
        {/* Subtitle */}
        {slide.bullets[0] && (
          <text x={PAD + 10} y={H * 0.38 + 28} fontSize="10" fill={MID_GRAY} fontFamily="sans-serif">
            {truncate(slide.bullets[0], 50)}
          </text>
        )}
        {/* Slide number */}
        <text x={W - 15} y={H - 10} fontSize="8" fill={BORDER} textAnchor="end" fontFamily="sans-serif">
          {String(slide.number).padStart(2, '0')}
        </text>
      </svg>
    );
  }

  // Content slide
  const maxBullets = Math.min(slide.bullets.length, 5);
  const bulletStartY = 70;
  const bulletSpacing = 28;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`Slide ${slide.number}: ${slide.title}`}>
      {/* Background */}
      <rect width={W} height={H} fill="white" rx="4" />
      {/* Header bar */}
      <rect x="0" y="0" width={W} height="44" fill={palette.pale} />
      <rect x="0" y="42" width={W} height="2" fill={palette.primary} opacity="0.3" />
      {/* Slide number badge */}
      <rect x={PAD} y="10" width="24" height="24" rx="4" fill={palette.primary} />
      <text x={PAD + 12} y="27" fontSize="11" fontWeight="700" fill="white" textAnchor="middle" fontFamily="sans-serif">
        {slide.number}
      </text>
      {/* Title */}
      <text x={PAD + 34} y="28" fontSize="13" fontWeight="700" fill={DARK} fontFamily="sans-serif">
        {truncate(slide.title, 35)}
      </text>

      {/* Bullet points */}
      {slide.bullets.slice(0, maxBullets).map((bullet, i) => (
        <g key={i}>
          <circle cx={PAD + 8} cy={bulletStartY + i * bulletSpacing + 1} r="3" fill={palette.primary} opacity="0.7" />
          <text
            x={PAD + 18}
            y={bulletStartY + i * bulletSpacing + 5}
            fontSize="9.5"
            fill={TEXT_COLOR}
            fontFamily="sans-serif"
          >
            {truncate(bullet, 48)}
          </text>
        </g>
      ))}

      {/* More indicator */}
      {slide.bullets.length > maxBullets && (
        <text x={PAD + 18} y={bulletStartY + maxBullets * bulletSpacing + 5} fontSize="8" fill={MID_GRAY} fontFamily="sans-serif">
          +{slide.bullets.length - maxBullets} more...
        </text>
      )}

      {/* Decorative accent */}
      <rect x={W - 8} y="55" width="4" height={H - 70} rx="2" fill={palette.light} />

      {/* Footer */}
      <text x={W - 15} y={H - 10} fontSize="8" fill={BORDER} textAnchor="end" fontFamily="sans-serif">
        {String(slide.number).padStart(2, '0')}
      </text>
    </svg>
  );
}

function truncate(text: string, max: number): string {
  const cleaned = text.replace(/[#*_`\-]/g, '').trim();
  return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
}
