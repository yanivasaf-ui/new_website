/**
 * DotImageLens — replaces dot-field-lens.js (the WebGL2 version). Same
 * job (circular cursor-reactive lens with a decaying trail), now using
 * the shared dot-image-reveal-core technique so it's visually and
 * technically consistent with DotSectionDissolve: dots mask the REAL
 * hero image, not a colored WebGL dot grid layered above it.
 *
 * Plain 2D canvas, no WebGL — a JS-side per-cell trail array does the
 * decay + splat simulation (cheap enough at this grid density that a
 * GPU shader isn't needed once the "solid color dots" approach is
 * replaced by this masking technique).
 *
 * Two things stay from the original lens spec:
 *  - A circular lens mask is ALWAYS visible wherever the cursor
 *    currently is (while active/not suppressed) — independent of trail.
 *  - A trail glow extends slightly behind the lens as it moves, then
 *    decays away fast, and does NOT repaint while the cursor is
 *    stationary (the "still cursor must not keep glowing" fix from
 *    earlier carries over).
 *
 * Usage — same contract shape as the old DotFieldLens:
 *   const lens = new DotImageLens(canvasEl, imageEl, { ...options });
 *   lens.resize(width, height, Math.min(devicePixelRatio, 2));
 *   lens.setCursor(xPx, yPx, isInside);
 *   lens.setSuppressed(overTextZone);   // for the sitewide-use case
 *   lens.tick(dtSeconds);                // call once per shared rAF frame
 *   lens.setActive(false);               // pause when off-screen
 *   lens.destroy();
 *
 * imageEl must be a loaded <img> (or other CanvasImageSource) — this
 * canvas STANDS IN for that image; don't render a separate visible
 * <img> underneath it.
 *
 * TWO MODES, same class:
 *   - Pass a real image (hero, section photos) -> dots reveal that
 *     image's actual pixels.
 *   - Pass null (everywhere else on the site — nav, buttons, plain
 *     background) -> dots render in a flat accent color instead, same
 *     trail/decay/lens mechanic, no image to composite. This is what
 *     makes the sitewide cursor trail possible outside the hero.
 */
import { renderDotMaskedImage } from './dot-image-reveal-core.js';

export class DotImageLens {
  constructor(canvas, image, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.image = image || null; // null = color-fallback mode, see class doc above
    this.cfg = {
      gridDensity:    options.gridDensity    ?? 90,
      decayPerSecond: options.decayPerSecond ?? 0.06,
      splatRadiusPx:  options.splatRadiusPx  ?? 90,
      moveEpsilonPx:  options.moveEpsilonPx  ?? 1.5,
      lensRadiusPx:   options.lensRadiusPx   ?? 220,
      lensFeatherPx:  options.lensFeatherPx  ?? 60,
      dotColor:       options.dotColor       ?? [0x6B, 0x2B, 0x3A], // used only when image is null
    };
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.cols = 0;
    this.rows = 0;
    this.trail = null;
    this.revealGrid = null;

    this.cursor = [0, 0];         // css px, canvas-relative
    this.lastFrameCursor = [0, 0];
    this.cursorInside = false;
    this.active = true;
    this.suppressed = false;
  }

  resize(cssWidth, cssHeight, dpr = 1) {
    this.dpr = dpr;
    this.width = Math.max(1, Math.floor(cssWidth * dpr));
    this.height = Math.max(1, Math.floor(cssHeight * dpr));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.cols = this.cfg.gridDensity;
    this.rows = Math.max(1, Math.round(this.cols * (cssHeight / cssWidth)));
    this.trail = new Float32Array(this.cols * this.rows);
    this.revealGrid = new Float32Array(this.cols * this.rows);
  }

  setCursor(xPx, yPx, isInside) {
    this.cursorInside = isInside;
    if (!isInside) return;
    this.cursor = [xPx, yPx];
  }

  setSuppressed(suppressed) {
    this.suppressed = suppressed;
  }

  setActive(active) {
    this.active = active;
  }

  tick(dt) {
    if (!this.active || !this.trail) return;
    const cfg = this.cfg;
    const cellW = this.cssWidth / this.cols;
    const cellH = this.cssHeight / this.rows;

    const decayFactor = Math.pow(cfg.decayPerSecond, dt);
    const moveDist = Math.hypot(this.cursor[0] - this.lastFrameCursor[0], this.cursor[1] - this.lastFrameCursor[1]);
    const isMoving = moveDist > cfg.moveEpsilonPx;
    const shouldSplat = this.cursorInside && !this.suppressed && isMoving;

    const [ax, ay] = this.lastFrameCursor;
    const [bx, by] = this.cursor;
    const abx = bx - ax, aby = by - ay;
    const abLenSq = Math.max(abx * abx + aby * aby, 1e-6);

    const lensActive = this.cursorInside && !this.suppressed ? 1 : 0;

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const idx = y * this.cols + x;
        const cx = (x + 0.5) * cellW;
        const cy = (y + 0.5) * cellH;

        // decay
        let val = this.trail[idx] * decayFactor;

        // splat along the segment from last frame's cursor to this one
        if (shouldSplat) {
          const t = Math.max(0, Math.min(1, ((cx - ax) * abx + (cy - ay) * aby) / abLenSq));
          const projX = ax + abx * t;
          const projY = ay + aby * t;
          const d = Math.hypot(cx - projX, cy - projY);
          if (d < cfg.splatRadiusPx) {
            const splat = 1 - d / cfg.splatRadiusPx;
            val = Math.max(val, splat);
          }
        }
        this.trail[idx] = val;

        // constant lens disc wherever the cursor currently is
        let lensMask = 0;
        if (lensActive) {
          const d = Math.hypot(cx - bx, cy - by);
          lensMask = 1 - Math.min(1, Math.max(0, (d - cfg.lensRadiusPx) / cfg.lensFeatherPx));
        }

        this.revealGrid[idx] = Math.max(val, lensMask);
      }
    }

    this.lastFrameCursor = this.cursor;
    renderDotMaskedImage(this.ctx, this.width, this.height, this.cols, this.rows, this.revealGrid, this.image, 0.62, this.cfg.dotColor);
  }

  destroy() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}
