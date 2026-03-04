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
const ICON_MAP = {
  "rocket":           "rocket_24_filled.svg",
  "lightbulb":        "lightbulb_24_filled.svg",
  "people-team":      "people_team_24_filled.svg",
  "target":           "target_24_filled.svg",
  "checkmark-circle": "checkmark_circle_24_filled.svg",
  "shield":           "shield_24_filled.svg",
  "arrow-trending-up":"arrow_trending_24_filled.svg",
  "brain":            "brain_circuit_24_filled.svg",
  "sparkle":          "sparkle_24_filled.svg",
  "star":             "star_24_filled.svg",
  "globe":            "globe_24_filled.svg",
  "document":         "document_24_filled.svg",
  "calendar":         "calendar_24_filled.svg",
  "money":            "money_24_filled.svg",
  "lock-closed":      "lock_closed_24_filled.svg",
  "cloud":            "cloud_24_filled.svg",
  "data-trending":    "data_trending_24_filled.svg",
  "building":         "building_bank_24_filled.svg",
  "chart":            "chart_multiple_24_filled.svg",
  "settings":         "settings_24_filled.svg",
  "warning":          "warning_24_filled.svg",
  "search":           "search_24_filled.svg",
  "code":             "code_24_filled.svg",
  "link":             "link_24_filled.svg",
};

// Brand color to tint icons (Copilot blue)
const TINT_COLOR = "#0078D4";

function tintSvg(svg) {
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
      const svgTinted = tintSvg(svgRaw);

      await sharp(Buffer.from(svgTinted))
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
