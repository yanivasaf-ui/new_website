/**
 * dot-image-reveal-core.js — shared rendering technique for both the
 * hero X-ray lens and the section-dissolve transitions, so they read as
 * one consistent system instead of two different effects that happen to
 * both use dots.
 *
 * THE TECHNIQUE (this is the part that was wrong before):
 * The dots don't sit as a colored layer ABOVE the image. They mask the
 * REAL image through a "destination-in" composite:
 *   1. Draw the dot shapes (any opaque color — it gets replaced) onto
 *      the canvas, sized/positioned per the current reveal state. This
 *      is the DESTINATION.
 *   2. Switch to `globalCompositeOperation = 'source-in'` — draws the
 *      new SOURCE only where it overlaps the existing DESTINATION's
 *      alpha, keeping the SOURCE's own color. (Easy to get backwards —
 *      `destination-in` keeps the destination's color clipped by the
 *      source's shape, which is the opposite of what we want here.)
 *   3. Draw the actual source image once, full-size.
 *   4. Only pixels where a dot was drawn show the image; everywhere
 *      else is transparent.
 * Result: the image's OWN pixels appear to materialize out of dot-
 * shaped fragments of itself — not a foreign color block sitting on
 * top of unrelated content.
 *
 * This file exports one function, renderDotMaskedImage(), used by both
 * DotImageLens (cursor-driven) and DotSectionDissolve (scroll-driven).
 * Neither of those files duplicate this compositing logic — they only
 * differ in HOW they compute each cell's reveal amount (0..1).
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width - canvas pixel width
 * @param {number} height - canvas pixel height
 * @param {number} cols
 * @param {number} rows
 * @param {Float32Array} revealGrid - length cols*rows, values 0..1
 * @param {CanvasImageSource|null} image - the real image being revealed,
 *   or null/undefined to fall back to a flat dot color (see fallbackColor)
 *   — use this for areas with no underlying image to reveal (i.e.
 *   anywhere outside the hero / section-entrance photos).
 * @param {number} maxDotSizeFactor - fraction of a cell's min dimension, at full reveal
 * @param {[number,number,number]} fallbackColor - RGB used when image is null
 */
export function renderDotMaskedImage(ctx, width, height, cols, rows, revealGrid, image, maxDotSizeFactor = 0.62, fallbackColor = [0x6B, 0x2B, 0x3A]) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, width, height);

  const cellW = width / cols;
  const cellH = height / rows;
  const maxRadius = Math.min(cellW, cellH) * maxDotSizeFactor;

  const [r, g, b] = fallbackColor;
  ctx.fillStyle = image ? '#fff' : `rgb(${r}, ${g}, ${b})`; // '#fff' is irrelevant when compositing — only the alpha shape matters
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const reveal = revealGrid[y * cols + x];
      if (reveal <= 0.02) continue;
      const cx = (x + 0.5) * cellW;
      const cy = (y + 0.5) * cellH;
      const rad = maxRadius * Math.min(1, reveal);
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (image) {
    // reveal mode — clip the real image to the dot shapes just drawn
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(image, 0, 0, width, height);
  }
  // else: no image — the colored dots drawn above ARE the final result,
  // nothing further to composite (this is the sitewide/no-image mode)
  ctx.restore();
}
