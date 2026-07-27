/**
 * DotSectionDissolve — replaces dot-dissolve-transition.js. Same job
 * (section images materialize in via dot dissolve as you scroll), now
 * using the shared dot-image-reveal-core technique: dots mask the REAL
 * image, not a flat color layer sitting above it.
 *
 * Desktop-only (per product decision).
 *
 * Usage:
 *   const dissolve = new DotSectionDissolve(canvasEl, imageEl);
 *   dissolve.resize(rect.width, rect.height, Math.min(devicePixelRatio, 2));
 *   dissolve.setProgress(p);  // 0 = fully covered, 1 = fully revealed
 *   dissolve.render();
 *
 * imageEl must be a loaded <img> (or other CanvasImageSource) matching
 * what this canvas is meant to visually replace — this canvas STANDS IN
 * for that image, it doesn't overlay a separately-visible one. Hide the
 * original <img> (or never render it) and let this canvas show it.
 */
import { renderDotMaskedImage } from './dot-image-reveal-core.js';

export class DotSectionDissolve {
  constructor(canvas, image, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.image = image;
    this.cfg = {
      gridDensity: options.gridDensity ?? 44,
      dissolveWindow: options.dissolveWindow ?? 0.12,
      randomSeed: options.randomSeed ?? 1,
    };
    this.width = 0;
    this.height = 0;
    this.cols = 0;
    this.rows = 0;
    this.progress = 0;
    this.thresholds = null;
    this.revealGrid = null;
  }

  resize(cssWidth, cssHeight, dpr = 1) {
    this.width = Math.max(1, Math.floor(cssWidth * dpr));
    this.height = Math.max(1, Math.floor(cssHeight * dpr));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.cols = this.cfg.gridDensity;
    this.rows = Math.max(1, Math.round(this.cols * (cssHeight / cssWidth)));
    this._generateThresholds();
  }

  _generateThresholds() {
    this.thresholds = new Float32Array(this.cols * this.rows);
    this.revealGrid = new Float32Array(this.cols * this.rows);
    let seed = this.cfg.randomSeed * 9301 + 49297;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < this.thresholds.length; i++) this.thresholds[i] = rand();
  }

  setProgress(p) {
    this.progress = Math.max(0, Math.min(1, p));
  }

  render() {
    if (!this.thresholds) return;
    // A cell starts hidden (reveal=0) and grows to fully revealed
    // (reveal=1) once progress passes its random threshold — dots grow
    // IN as the real image becomes visible, not shrink away. (Inverted
    // from a "dots hide content" model — here dots ARE the visible
    // content, via destination-in compositing.)
    for (let i = 0; i < this.thresholds.length; i++) {
      const distPastReveal = this.progress - this.thresholds[i];
      this.revealGrid[i] = distPastReveal <= 0
        ? 0
        : Math.min(1, distPastReveal / this.cfg.dissolveWindow);
    }
    renderDotMaskedImage(this.ctx, this.width, this.height, this.cols, this.rows, this.revealGrid, this.image);
  }

  destroy() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}
