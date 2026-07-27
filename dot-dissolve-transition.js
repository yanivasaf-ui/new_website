/**
 * DotDissolveTransition — a 2D-canvas overlay that covers a section's
 * entrance zone with a field of dots (matching that section's own
 * background color), then dissolves them away cell-by-cell, in a
 * randomized (not uniform-wipe) pattern, as the user scrolls the section
 * into view. Replaces a plain opacity fade at section boundaries with the
 * halftone "materializing" transition seen on lamalama.com.
 *
 * Desktop-only (per product decision) — don't construct on touch/narrow
 * viewports, same threshold as DotFieldLens.
 *
 * This is plain 2D canvas, not WebGL — no cursor simulation needed here,
 * just a static per-cell random threshold compared against scroll
 * progress each frame, so it's cheap even with several instances mounted
 * (one per section boundary) at once.
 *
 * Integration:
 *
 *   const dissolve = new DotDissolveTransition(canvasEl, {
 *     dotColor: [0xEF, 0xE6, 0xD8], // MUST match the section's own background
 *   });
 *   dissolve.resize(rect.width, rect.height, Math.min(devicePixelRatio, 2));
 *   dissolve.setProgress(p);   // 0 = fully covered (dots hide the section),
 *                              // 1 = fully revealed (no dots, content clear)
 *                              // drive this from scroll position — see below
 *   dissolve.render();         // call whenever progress changes (scroll handler
 *                              // or shared rAF loop, either works — this class
 *                              // does not run its own loop)
 *
 * Computing progress from scroll (typical pattern — adjust the zone size
 * to taste, this covers the top ~400px of the section as the dissolve
 * zone):
 *
 *   const DISSOLVE_ZONE_PX = 400;
 *   function updateProgress() {
 *     const rect = sectionEl.getBoundingClientRect();
 *     const raw = (window.innerHeight - rect.top) / DISSOLVE_ZONE_PX;
 *     dissolve.setProgress(raw);
 *     dissolve.render();
 *   }
 *   window.addEventListener('scroll', updateProgress, { passive: true });
 */

export class DotDissolveTransition {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cfg = {
      dotColor:     options.dotColor     || [0xEF, 0xE6, 0xD8], // match the section's own bg
      gridDensity:  options.gridDensity  ?? 44,   // columns across the width
      dotMaxSize:   options.dotMaxSize   ?? 0.46, // fraction of a cell
      dissolveWindow: options.dissolveWindow ?? 0.12, // how much progress-range a single dot takes to shrink away
      randomSeed:   options.randomSeed   ?? 1,
    };
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.progress = 0;
    this.cols = 0;
    this.rows = 0;
    this.thresholds = null;
  }

  /** Call on mount and on the section's resize. */
  resize(cssWidth, cssHeight, dpr = 1) {
    this.dpr = dpr;
    this.width = Math.max(1, Math.floor(cssWidth * dpr));
    this.height = Math.max(1, Math.floor(cssHeight * dpr));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this._generateThresholds(cssWidth, cssHeight);
  }

  _generateThresholds(cssWidth, cssHeight) {
    this.cols = this.cfg.gridDensity;
    this.rows = Math.max(1, Math.round(this.cols * (cssHeight / cssWidth)));
    this.thresholds = new Float32Array(this.cols * this.rows);
    // small deterministic PRNG so the pattern is stable across resizes/reloads
    let seed = this.cfg.randomSeed * 9301 + 49297;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < this.thresholds.length; i++) this.thresholds[i] = rand();
  }

  /** 0 = fully covered (section hidden behind dots), 1 = fully revealed. */
  setProgress(p) {
    this.progress = Math.max(0, Math.min(1, p));
  }

  /** Draw the current state. Call after setProgress() changes. */
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.progress >= 0.999 || !this.thresholds) return; // fully revealed — nothing to draw

    const cellW = this.width / this.cols;
    const cellH = this.height / this.rows;
    const [r, g, b] = this.cfg.dotColor;
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const threshold = this.thresholds[y * this.cols + x];
        const distFromReveal = threshold - this.progress;
        if (distFromReveal <= 0) continue; // this cell has already dissolved away

        // full size while far from its reveal point, shrinks smoothly to
        // zero right as progress reaches its threshold — soft dissolve,
        // not an abrupt pop
        const sizeFactor = Math.min(1, distFromReveal / this.cfg.dissolveWindow);
        if (sizeFactor <= 0.02) continue;

        const cx = (x + 0.5) * cellW;
        const cy = (y + 0.5) * cellH;
        const radius = Math.min(cellW, cellH) * this.cfg.dotMaxSize * sizeFactor;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** No GL resources to free, but kept for a consistent teardown contract. */
  destroy() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}
