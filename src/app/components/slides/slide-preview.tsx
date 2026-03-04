/**
 * UI Component: Slide SVG Preview
 * Renders layout-aware slide previews using SVG.
 * Each layout type (title, cards, stats, etc.) has a distinct visual template.
 */

'use client';

import React from 'react';
import type { SlideItem } from '@/domain/entities/slide-work';

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
const LIGHT_BG = '#F5F5F5';

const W = 400;
const H = 250;
const PAD = 20;

interface SlidePreviewProps {
  slide: SlideItem;
  className?: string;
}

export function SlidePreview({ slide, className }: SlidePreviewProps) {
  const palette = COLORS[slide.accent] || COLORS.blue;

  switch (slide.layout) {
    case 'title':
      return <TitleLayout slide={slide} palette={palette} className={className} />;
    case 'section':
      return <SectionLayout slide={slide} palette={palette} className={className} />;
    case 'cards':
      return <CardsLayout slide={slide} palette={palette} className={className} />;
    case 'stats':
      return <StatsLayout slide={slide} palette={palette} className={className} />;
    case 'comparison':
      return <ComparisonLayout slide={slide} palette={palette} className={className} />;
    case 'timeline':
      return <TimelineLayout slide={slide} palette={palette} className={className} />;
    case 'agenda':
      return <AgendaLayout slide={slide} palette={palette} className={className} />;
    case 'summary':
      return <SummaryLayout slide={slide} palette={palette} className={className} />;
    default:
      return <BulletsLayout slide={slide} palette={palette} className={className} />;
  }
}

type Palette = { primary: string; light: string; pale: string };
type LayoutProps = { slide: SlideItem; palette: Palette; className?: string };

function TitleLayout({ slide, palette, className }: LayoutProps) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={slide.title}>
      <rect width={W} height={H} fill={palette.primary} rx="4" />
      <rect x={W - 120} y="0" width="120" height={H} fill="white" opacity="0.08" />
      <circle cx={W - 50} cy={H / 2} r="45" fill="white" opacity="0.06" />
      {/* Icon placeholder */}
      {slide.icon && <circle cx={PAD + 20} cy={H * 0.32} r="16" fill="white" opacity="0.2" />}
      {slide.icon && <text x={PAD + 20} y={H * 0.32 + 4} fontSize="10" fill="white" textAnchor="middle" fontFamily="sans-serif">📎</text>}
      <text x={PAD + (slide.icon ? 48 : 10)} y={H * 0.38} fontSize="18" fontWeight="700" fill="white" fontFamily="sans-serif">
        {truncate(slide.title, 26)}
      </text>
      {slide.bullets[0] && (
        <text x={PAD + 10} y={H * 0.38 + 26} fontSize="9" fill="white" opacity="0.8" fontFamily="sans-serif">
          {truncate(slide.bullets[0], 50)}
        </text>
      )}
      {slide.keyMessage && (
        <text x={PAD + 10} y={H - 30} fontSize="7.5" fill="white" opacity="0.6" fontFamily="sans-serif">
          {truncate(slide.keyMessage, 55)}
        </text>
      )}
      <text x={W - 15} y={H - 10} fontSize="8" fill="white" opacity="0.3" textAnchor="end" fontFamily="sans-serif">
        {String(slide.number).padStart(2, '0')}
      </text>
    </svg>
  );
}

function SectionLayout({ slide, palette, className }: LayoutProps) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={slide.title}>
      <rect width={W} height={H} fill={DARK} rx="4" />
      <rect x="0" y="0" width="8" height={H} fill={palette.primary} />
      <rect x={PAD + 30} y={H * 0.65} width="80" height="3" fill={palette.primary} />
      <text x={PAD + 30} y={H * 0.45} fontSize="20" fontWeight="700" fill="white" fontFamily="sans-serif">
        {truncate(slide.title, 22)}
      </text>
      {slide.keyMessage && (
        <text x={PAD + 30} y={H * 0.45 + 24} fontSize="9" fill={palette.light} fontFamily="sans-serif">
          {truncate(slide.keyMessage, 45)}
        </text>
      )}
    </svg>
  );
}

function CardsLayout({ slide, palette, className }: LayoutProps) {
  const cardCount = Math.min(slide.bullets.length, 4);
  const cardW = (W - PAD * 2 - (cardCount - 1) * 8) / cardCount;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={slide.title}>
      <rect width={W} height={H} fill="white" rx="4" />
      <ContentHeader slide={slide} palette={palette} />
      {slide.bullets.slice(0, cardCount).map((bullet, i) => {
        const x = PAD + i * (cardW + 8);
        return (
          <g key={i}>
            <rect x={x} y="70" width={cardW} height={H - 90} rx="6" fill={LIGHT_BG} />
            <rect x={x + 8} y="76" width={cardW - 16} height="3" rx="1" fill={palette.primary} opacity="0.6" />
            {slide.icon && <rect x={x + 8} y="86" width="14" height="14" rx="3" fill={palette.light} />}
            <text x={x + (slide.icon ? 28 : 10)} y="96" fontSize="7.5" fontWeight="600" fill={DARK} fontFamily="sans-serif">
              {truncate(bullet.split(':')[0] || bullet.split('—')[0] || bullet, Math.floor(cardW / 6))}
            </text>
            <text x={x + 10} y="114" fontSize="6.5" fill={TEXT_COLOR} fontFamily="sans-serif">
              {truncate(bullet.split(':')[1] || bullet.split('—')[1] || '', Math.floor(cardW / 5))}
            </text>
          </g>
        );
      })}
      <Footer slide={slide} />
    </svg>
  );
}

function StatsLayout({ slide, palette, className }: LayoutProps) {
  const statCount = Math.min(slide.bullets.length, 3);
  const statW = (W - PAD * 2 - (statCount - 1) * 12) / statCount;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={slide.title}>
      <rect width={W} height={H} fill="white" rx="4" />
      <ContentHeader slide={slide} palette={palette} />
      {slide.bullets.slice(0, statCount).map((bullet, i) => {
        const x = PAD + i * (statW + 12);
        const [value, ...rest] = bullet.split(/[:：]/);
        return (
          <g key={i}>
            <rect x={x} y="75" width={statW} height={H - 95} rx="8" fill="white" stroke={palette.primary} strokeWidth="1.5" />
            <text x={x + statW / 2} y="125" fontSize="22" fontWeight="700" fill={palette.primary} textAnchor="middle" fontFamily="sans-serif">
              {truncate(value?.trim() || '', 10)}
            </text>
            <text x={x + statW / 2} y="148" fontSize="7" fill={MID_GRAY} textAnchor="middle" fontFamily="sans-serif">
              {truncate(rest.join(':').trim(), Math.floor(statW / 5))}
            </text>
          </g>
        );
      })}
      <Footer slide={slide} />
    </svg>
  );
}

function ComparisonLayout({ slide, palette, className }: LayoutProps) {
  const colW = (W - PAD * 2 - 16) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={slide.title}>
      <rect width={W} height={H} fill="white" rx="4" />
      <ContentHeader slide={slide} palette={palette} />
      {/* Left column */}
      <rect x={PAD} y="70" width={colW} height={H - 90} rx="6" fill={palette.pale} />
      <text x={PAD + colW / 2} y="88" fontSize="8" fontWeight="600" fill={palette.primary} textAnchor="middle" fontFamily="sans-serif">
        {slide.bullets[0] ? truncate(slide.bullets[0], 18) : 'Before'}
      </text>
      {/* Right column */}
      <rect x={PAD + colW + 16} y="70" width={colW} height={H - 90} rx="6" fill={LIGHT_BG} />
      <text x={PAD + colW + 16 + colW / 2} y="88" fontSize="8" fontWeight="600" fill={DARK} textAnchor="middle" fontFamily="sans-serif">
        {slide.bullets[1] ? truncate(slide.bullets[1], 18) : 'After'}
      </text>
      {/* Arrow */}
      <text x={PAD + colW + 8} y={H / 2 + 10} fontSize="14" fill={palette.primary} textAnchor="middle" fontFamily="sans-serif">→</text>
      {slide.bullets.slice(2, 5).map((b, i) => (
        <text key={i} x={PAD + colW + 24} y={105 + i * 18} fontSize="7" fill={TEXT_COLOR} fontFamily="sans-serif">• {truncate(b, 24)}</text>
      ))}
      <Footer slide={slide} />
    </svg>
  );
}

function TimelineLayout({ slide, palette, className }: LayoutProps) {
  const stepCount = Math.min(slide.bullets.length, 5);
  const stepW = (W - PAD * 2) / stepCount;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={slide.title}>
      <rect width={W} height={H} fill="white" rx="4" />
      <ContentHeader slide={slide} palette={palette} />
      {/* Timeline line */}
      <line x1={PAD + 15} y1="120" x2={W - PAD - 15} y2="120" stroke={palette.light} strokeWidth="3" />
      {slide.bullets.slice(0, stepCount).map((bullet, i) => {
        const cx = PAD + 15 + i * stepW + (i > 0 ? 0 : 0);
        return (
          <g key={i}>
            <circle cx={cx} cy="120" r="10" fill={palette.primary} />
            <text x={cx} y="124" fontSize="8" fontWeight="700" fill="white" textAnchor="middle" fontFamily="sans-serif">{i + 1}</text>
            <text x={cx} y="145" fontSize="6.5" fontWeight="600" fill={DARK} textAnchor="middle" fontFamily="sans-serif">
              {truncate(bullet, Math.floor(stepW / 5))}
            </text>
          </g>
        );
      })}
      <Footer slide={slide} />
    </svg>
  );
}

function AgendaLayout({ slide, palette, className }: LayoutProps) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={slide.title}>
      <rect width={W} height={H} fill="white" rx="4" />
      <ContentHeader slide={slide} palette={palette} />
      {slide.bullets.slice(0, 5).map((bullet, i) => (
        <g key={i}>
          <rect x={PAD} y={72 + i * 32} width="22" height="22" rx="4" fill={palette.primary} />
          <text x={PAD + 11} y={87 + i * 32} fontSize="10" fontWeight="700" fill="white" textAnchor="middle" fontFamily="sans-serif">{i + 1}</text>
          <text x={PAD + 32} y={87 + i * 32} fontSize="9" fill={DARK} fontFamily="sans-serif">
            {truncate(bullet, 42)}
          </text>
        </g>
      ))}
      <Footer slide={slide} />
    </svg>
  );
}

function SummaryLayout({ slide, palette, className }: LayoutProps) {
  const items = slide.bullets.slice(0, 3);
  const itemH = Math.min(45, (H - 90) / items.length - 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={slide.title}>
      <rect width={W} height={H} fill="white" rx="4" />
      <ContentHeader slide={slide} palette={palette} />
      {items.map((bullet, i) => (
        <g key={i}>
          <rect x={PAD} y={72 + i * (itemH + 6)} width={W - PAD * 2} height={itemH} rx="6" fill={i === 0 ? palette.pale : LIGHT_BG} />
          <circle cx={PAD + 18} cy={72 + i * (itemH + 6) + itemH / 2} r="8" fill={palette.primary} />
          <text x={PAD + 18} y={72 + i * (itemH + 6) + itemH / 2 + 3} fontSize="8" fontWeight="700" fill="white" textAnchor="middle" fontFamily="sans-serif">✔</text>
          <text x={PAD + 34} y={72 + i * (itemH + 6) + itemH / 2 + 3} fontSize="8.5" fontWeight="600" fill={DARK} fontFamily="sans-serif">
            {truncate(bullet, 45)}
          </text>
        </g>
      ))}
      <Footer slide={slide} />
    </svg>
  );
}

function BulletsLayout({ slide, palette, className }: LayoutProps) {
  const maxBullets = Math.min(slide.bullets.length, 5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={slide.title}>
      <rect width={W} height={H} fill="white" rx="4" />
      <ContentHeader slide={slide} palette={palette} />
      {slide.bullets.slice(0, maxBullets).map((bullet, i) => (
        <g key={i}>
          <circle cx={PAD + 8} cy={80 + i * 28} r="3" fill={palette.primary} opacity="0.7" />
          <text x={PAD + 18} y={84 + i * 28} fontSize="9.5" fill={TEXT_COLOR} fontFamily="sans-serif">
            {truncate(bullet, 48)}
          </text>
        </g>
      ))}
      {slide.bullets.length > maxBullets && (
        <text x={PAD + 18} y={84 + maxBullets * 28} fontSize="8" fill={MID_GRAY} fontFamily="sans-serif">
          +{slide.bullets.length - maxBullets} more...
        </text>
      )}
      <rect x={W - 8} y="55" width="4" height={H - 70} rx="2" fill={palette.light} />
      <Footer slide={slide} />
    </svg>
  );
}

function ContentHeader({ slide, palette }: { slide: SlideItem; palette: Palette }) {
  return (
    <>
      <rect x="0" y="0" width={W} height="44" fill={palette.pale} />
      <rect x="0" y="42" width={W} height="2" fill={palette.primary} opacity="0.3" />
      <rect x={PAD} y="10" width="24" height="24" rx="4" fill={palette.primary} />
      <text x={PAD + 12} y="27" fontSize="11" fontWeight="700" fill="white" textAnchor="middle" fontFamily="sans-serif">
        {slide.number}
      </text>
      <text x={PAD + 34} y="22" fontSize="12" fontWeight="700" fill={DARK} fontFamily="sans-serif">
        {truncate(slide.title, 30)}
      </text>
      {slide.keyMessage && (
        <text x={PAD + 34} y="35" fontSize="7" fill={MID_GRAY} fontFamily="sans-serif">
          {truncate(slide.keyMessage, 48)}
        </text>
      )}
      {slide.icon && (
        <>
          <rect x={W - PAD - 24} y="10" width="24" height="24" rx="4" fill={palette.light} />
          <text x={W - PAD - 12} y="27" fontSize="8" fill={palette.primary} textAnchor="middle" fontFamily="sans-serif">
            {slide.icon.slice(0, 3)}
          </text>
        </>
      )}
    </>
  );
}

function Footer({ slide }: { slide: SlideItem }) {
  return (
    <>
      <rect x={PAD} y={H - 18} width={50} height="0.5" fill={BORDER} />
      <text x={W - 15} y={H - 8} fontSize="7" fill={BORDER} textAnchor="end" fontFamily="sans-serif">
        {String(slide.number).padStart(2, '0')}
      </text>
      <text x={PAD} y={H - 8} fontSize="6" fill={MID_GRAY} fontFamily="sans-serif">
        {slide.layout}
      </text>
    </>
  );
}

function truncate(text: string, max: number): string {
  const cleaned = text.replace(/[#*_`\-]/g, '').trim();
  return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
}
