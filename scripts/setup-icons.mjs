#!/usr/bin/env node
/**
 * setup-icons.mjs
 * Converts Fluent UI SVG icons → 64x64 PNG for embedding in PPTX slides.
 * Usage: node scripts/setup-icons.mjs
 */
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import sharp from "sharp";

const ICONS_SRC = resolve("node_modules/@fluentui/svg-icons/icons");
const ICONS_OUT = resolve("public/icons");
const SIZE = 64;

// Curated icon set for presentations (name → SVG filename pattern)
// Using _color variants for rich multi-color icons (PowerPoint style)
const ICON_MAP = {
  "rocket":           "rocket_24_filled.svg",        // no color variant
  "lightbulb":        "lightbulb_24_color.svg",
  "people-team":      "people_team_24_color.svg",
  "target":           "target_24_filled.svg",        // no color variant
  "checkmark-circle": "checkmark_circle_24_color.svg",
  "shield":           "shield_24_color.svg",
  "arrow-trending-up":"arrow_trending_lines_24_color.svg",
  "brain":            "bot_sparkle_24_color.svg",
  "sparkle":          "lightbulb_checkmark_24_color.svg",
  "star":             "star_24_color.svg",
  "globe":            "globe_24_color.svg",
  "document":         "document_24_color.svg",
  "calendar":         "calendar_24_color.svg",
  "money":            "savings_24_color.svg",
  "lock-closed":      "lock_closed_24_color.svg",
  "cloud":            "cloud_24_color.svg",
  "data-trending":    "data_trending_24_color.svg",
  "building":         "building_24_color.svg",
  "chart":            "chart_multiple_24_color.svg",
  "settings":         "settings_24_color.svg",
  "warning":          "warning_24_color.svg",
  "search":           "search_sparkle_24_color.svg",
  "code":             "code_24_color.svg",
  "link":             "link_24_color.svg",
};

// Brand color to tint filled icons (Copilot blue) — only for non-color variants
const TINT_COLOR = "#0078D4";

function tintSvg(svg, isColor) {
  if (isColor) return svg; // Color variants already have proper colors
  // Replace fill colors with brand color, but keep "none" fills
  return svg.replace(/fill="(?!none)[^"]*"/g, `fill="${TINT_COLOR}"`);
}

async function main() {
  if (!existsSync(ICONS_OUT)) {
    mkdirSync(ICONS_OUT, { recursive: true });
  }

  let success = 0;
  let skipped = 0;

  for (const [name, file] of Object.entries(ICON_MAP)) {
    const svgPath = join(ICONS_SRC, file);
    const outPath = join(ICONS_OUT, `${name}.png`);

    if (!existsSync(svgPath)) {
      console.warn(`  ⚠ Skip: ${file} not found`);
      skipped++;
      continue;
    }

    try {
      const svgRaw = readFileSync(svgPath, "utf-8");
      const isColor = file.includes("_color");
      const svgProcessed = tintSvg(svgRaw, isColor);

      await sharp(Buffer.from(svgProcessed))
        .resize(SIZE, SIZE)
        .png()
        .toFile(outPath);

      console.log(`  ✓ ${name}.png`);
      success++;
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\nDone: ${success} icons generated, ${skipped} skipped → ${ICONS_OUT}`);
}

main().catch(console.error);
