/**
 * DotFieldLens — WebGL2 cursor-reactive dot-field, masked to a circular
 * lens that follows the cursor. Built to REPLACE the hero's existing 2D
 * `dustRef` canvas as the X-ray-lens effect.
 *
 * Renders with a transparent background (alpha-blended) so it composites
 * directly over the hero's existing video/content layers — this is not a
 * full-bleed background effect, only a circular reveal + trail.
 *
 * Integration contract (matches the shared-raf-loop / bounding-rect /
 * scroll-pause / unmount pattern already used by dustRef):
 *
 *   const lens = new DotFieldLens(canvasEl, { ...optional overrides });
 *   lens.resize(rect.width, rect.height, Math.min(devicePixelRatio, 2));
 *   lens.setCursor(xPx, yPx, isInsideHero);   // call on pointermove
 *   lens.tick(dtSeconds);                      // call once per shared rAF frame
 *   lens.setActive(false);                     // call when hero scrolls offscreen — stops sim, does not destroy
 *   lens.destroy();                             // call in componentWillUnmount
 *
 * Desktop-only by design (per product decision) — gate construction on the
 * caller's side, e.g.:
 *   const DESKTOP_MIN_WIDTH = 1024;
 *   const isTouchOrNarrow = matchMedia('(pointer: coarse)').matches
 *     || window.innerWidth < DESKTOP_MIN_WIDTH;
 *   if (!isTouchOrNarrow) { this.dotFieldLens = new DotFieldLens(this.dustRef); }
 *   // else: leave the canvas unused, or don't render it at all in the template.
 */

export class DotFieldLens {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.cfg = {
      dimDotColor:    options.dimDotColor    || [0xC9, 0xBE, 0xAE], // low-contrast base dot tone
      brightDotColor: options.brightDotColor || [0x6B, 0x2B, 0x3A], // wine/burgundy accent
      gridDensity:     options.gridDensity     ?? 90,   // dots across the shorter axis
      dotBaseSize:     options.dotBaseSize     ?? 0.10,
      dotMaxSize:      options.dotMaxSize      ?? 0.42,
      decayPerSecond:  options.decayPerSecond  ?? 0.06, // fast fade — see prior fix
      splatRadius:     options.splatRadius     ?? 0.035,
      splatStrength:   options.splatStrength   ?? 1.0,
      moveEpsilon:     options.moveEpsilon     ?? 0.0006,
      simResolution:   options.simResolution   ?? 256,
      lensRadiusPx:    options.lensRadiusPx    ?? 220,  // matches original ~220px lens spec
      lensFeatherPx:   options.lensFeatherPx   ?? 60,
    };

    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: false });
    if (!gl) throw new Error('DotFieldLens: WebGL2 not supported');
    this.gl = gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this._compile();
    this._makeTrailTargets();

    this.width = 0;
    this.height = 0;
    this.dpr = 1;

    this.cursor = [0.5, 0.5];       // canvas UV, updated live by setCursor()
    this.lastFrameCursor = [0.5, 0.5];
    this.cursorInside = false;
    this.active = true;

    this.vao = gl.createVertexArray();
  }

  // ---- shader compilation ----
  _compile() {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error('DotFieldLens shader compile error: ' + log);
      }
      return s;
    };
    const link = (vsSrc, fsSrc) => {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(p);
        gl.deleteProgram(p);
        throw new Error('DotFieldLens program link error: ' + log);
      }
      return p;
    };

    const VS = `#version 300 es
      out vec2 v_uv;
      void main() {
        vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
        v_uv = pos;
        gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
      }`;

    const SIM_FS = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      out vec4 fragColor;
      uniform sampler2D u_previousTrail;
      uniform vec2 u_cursor;
      uniform vec2 u_cursorPrev;
      uniform float u_decayFactor;
      uniform float u_splatRadius;
      uniform float u_splatStrength;
      uniform float u_hasCursor;

      float distToSegment(vec2 p, vec2 a, vec2 b) {
        vec2 ab = b - a;
        float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
        vec2 proj = a + ab * t;
        return length(p - proj);
      }
      void main() {
        float prev = texture(u_previousTrail, v_uv).r;
        float decayed = prev * u_decayFactor;
        float d = distToSegment(v_uv, u_cursorPrev, u_cursor);
        float splat = smoothstep(u_splatRadius, 0.0, d) * u_splatStrength * u_hasCursor;
        float val = clamp(decayed + splat, 0.0, 1.0);
        fragColor = vec4(val, 0.0, 0.0, 1.0);
      }`;

    const RENDER_FS = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      out vec4 fragColor;
      uniform sampler2D u_trail;
      uniform vec2 u_resolution;
      uniform float u_gridDensity;
      uniform vec3 u_dimDotColor;
      uniform vec3 u_brightDotColor;
      uniform float u_dotBaseSize;
      uniform float u_dotMaxSize;
      uniform float u_time;
      uniform vec2 u_lensCenter;   // canvas UV, y-up
      uniform float u_lensRadius;  // canvas UV units (aspect-corrected)
      uniform float u_lensFeather; // canvas UV units
      uniform float u_lensActive;  // 0/1 — cursor currently inside hero bounds

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        float aspect = u_resolution.x / u_resolution.y;
        vec2 aspectUv = v_uv * vec2(aspect, 1.0);
        vec2 lensCenterAspect = u_lensCenter * vec2(aspect, 1.0);

        vec2 gridUvSpace = aspectUv * u_gridDensity;
        vec2 cellId = floor(gridUvSpace);
        vec2 cellLocal = fract(gridUvSpace) - 0.5;
        vec2 cellCenterUv = (cellId + 0.5) / (vec2(aspect, 1.0) * u_gridDensity);

        float trail = texture(u_trail, cellCenterUv).r;

        // idle shimmer on fully-dim dots so the lens interior doesn't feel static
        float jitter = hash(cellId);
        float shimmer = 0.5 + 0.5 * sin(u_time * 0.6 + jitter * 6.2831);
        float idleBoost = (1.0 - smoothstep(0.0, 0.15, trail)) * shimmer * 0.06;
        float t = clamp(trail + idleBoost, 0.0, 1.0);

        // circular lens mask around the cursor's CURRENT position — always
        // visible while active, independent of trail decay
        float distToLensCenter = length(aspectUv - lensCenterAspect);
        float lensMask = (1.0 - smoothstep(u_lensRadius, u_lensRadius + u_lensFeather, distToLensCenter)) * u_lensActive;

        // trail glow may extend slightly beyond the current lens position
        // (a comet tail dissolving behind the moving lens)
        float visibility = max(lensMask, trail);
        if (visibility <= 0.001) { fragColor = vec4(0.0); return; }

        float size = mix(u_dotBaseSize, u_dotMaxSize, t);
        float dist = length(cellLocal);
        float dotShape = smoothstep(size, size - 0.06, dist);

        vec3 dotColor = mix(u_dimDotColor, u_brightDotColor, smoothstep(0.0, 0.85, trail));
        float alpha = dotShape * visibility;
        fragColor = vec4(dotColor * alpha, alpha); // premultiplied, alpha:false blend mode above handles the rest
      }`;

    this.simProgram = link(VS, SIM_FS);
    this.renderProgram = link(VS, RENDER_FS);

    this.simU = {
      previousTrail: gl.getUniformLocation(this.simProgram, 'u_previousTrail'),
      cursor: gl.getUniformLocation(this.simProgram, 'u_cursor'),
      cursorPrev: gl.getUniformLocation(this.simProgram, 'u_cursorPrev'),
      decayFactor: gl.getUniformLocation(this.simProgram, 'u_decayFactor'),
      splatRadius: gl.getUniformLocation(this.simProgram, 'u_splatRadius'),
      splatStrength: gl.getUniformLocation(this.simProgram, 'u_splatStrength'),
      hasCursor: gl.getUniformLocation(this.simProgram, 'u_hasCursor'),
    };
    this.renderU = {
      trail: gl.getUniformLocation(this.renderProgram, 'u_trail'),
      resolution: gl.getUniformLocation(this.renderProgram, 'u_resolution'),
      gridDensity: gl.getUniformLocation(this.renderProgram, 'u_gridDensity'),
      dimDotColor: gl.getUniformLocation(this.renderProgram, 'u_dimDotColor'),
      brightDotColor: gl.getUniformLocation(this.renderProgram, 'u_brightDotColor'),
      dotBaseSize: gl.getUniformLocation(this.renderProgram, 'u_dotBaseSize'),
      dotMaxSize: gl.getUniformLocation(this.renderProgram, 'u_dotMaxSize'),
      time: gl.getUniformLocation(this.renderProgram, 'u_time'),
      lensCenter: gl.getUniformLocation(this.renderProgram, 'u_lensCenter'),
      lensRadius: gl.getUniformLocation(this.renderProgram, 'u_lensRadius'),
      lensFeather: gl.getUniformLocation(this.renderProgram, 'u_lensFeather'),
      lensActive: gl.getUniformLocation(this.renderProgram, 'u_lensActive'),
    };
  }

  _makeTrailTargets() {
    const gl = this.gl;
    const res = this.cfg.simResolution;
    const make = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, res, res, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo };
    };
    this.trailA = make();
    this.trailB = make();
    [this.trailA, this.trailB].forEach((t) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, res, res);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ---- public API ----

  /** Call on hero resize / on mount, with the hero's actual bounding rect. */
  resize(cssWidth, cssHeight, dpr = 1) {
    this.dpr = dpr;
    this.width = Math.max(1, Math.floor(cssWidth * dpr));
    this.height = Math.max(1, Math.floor(cssHeight * dpr));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  /** Call on pointermove within (or leaving) the hero. Coordinates in CSS px relative to the hero. */
  setCursor(xPx, yPx, isInside) {
    this.cursorInside = isInside;
    if (!isInside) return;
    const x = xPx / (this.width / this.dpr);
    const y = 1.0 - yPx / (this.height / this.dpr);
    this.cursor = [x, y];
  }

  /** Pause/resume without destroying GL resources — call when hero scrolls on/off screen. */
  setActive(active) {
    this.active = active;
  }

  /** Call once per shared rAF frame with the frame's delta time in seconds. */
  tick(dt) {
    if (!this.active) return;
    const gl = this.gl;
    const cfg = this.cfg;

    const decayFactor = Math.pow(cfg.decayPerSecond, dt);
    const moveDist = Math.hypot(this.cursor[0] - this.lastFrameCursor[0], this.cursor[1] - this.lastFrameCursor[1]);
    const isMoving = moveDist > cfg.moveEpsilon ? 1.0 : 0.0;
    const hasCursor = this.cursorInside ? 1.0 : 0.0;

    // PASS 1 — simulate trail
    const from = this.trailA, to = this.trailB;
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
    gl.viewport(0, 0, cfg.simResolution, cfg.simResolution);
    gl.disable(gl.BLEND); // trail buffer is a raw value store, not composited
    gl.useProgram(this.simProgram);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, from.tex);
    gl.uniform1i(this.simU.previousTrail, 0);
    gl.uniform2f(this.simU.cursor, this.cursor[0], this.cursor[1]);
    gl.uniform2f(this.simU.cursorPrev, this.lastFrameCursor[0], this.lastFrameCursor[1]);
    gl.uniform1f(this.simU.decayFactor, decayFactor);
    gl.uniform1f(this.simU.splatRadius, cfg.splatRadius);
    gl.uniform1f(this.simU.splatStrength, cfg.splatStrength);
    gl.uniform1f(this.simU.hasCursor, hasCursor * isMoving);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.lastFrameCursor = this.cursor;
    this.trailA = to; this.trailB = from;

    // PASS 2 — render, alpha-composited over whatever sits beneath this canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied-alpha blend, matches shader output
    gl.useProgram(this.renderProgram);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.trailA.tex);
    gl.uniform1i(this.renderU.trail, 0);
    gl.uniform2f(this.renderU.resolution, this.width, this.height);
    gl.uniform1f(this.renderU.gridDensity, cfg.gridDensity);
    gl.uniform3f(this.renderU.dimDotColor, cfg.dimDotColor[0] / 255, cfg.dimDotColor[1] / 255, cfg.dimDotColor[2] / 255);
    gl.uniform3f(this.renderU.brightDotColor, cfg.brightDotColor[0] / 255, cfg.brightDotColor[1] / 255, cfg.brightDotColor[2] / 255);
    gl.uniform1f(this.renderU.dotBaseSize, cfg.dotBaseSize);
    gl.uniform1f(this.renderU.dotMaxSize, cfg.dotMaxSize);
    gl.uniform1f(this.renderU.time, performance.now() / 1000);
    gl.uniform2f(this.renderU.lensCenter, this.cursor[0], this.cursor[1]);
    // convert px radii to the same aspect-corrected UV space the shader works in
    const shortAxis = Math.min(this.width, this.height) / this.dpr;
    gl.uniform1f(this.renderU.lensRadius, cfg.lensRadiusPx / shortAxis);
    gl.uniform1f(this.renderU.lensFeather, cfg.lensFeatherPx / shortAxis);
    gl.uniform1f(this.renderU.lensActive, this.cursorInside ? 1.0 : 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Call in componentWillUnmount. */
  destroy() {
    const gl = this.gl;
    [this.trailA, this.trailB].forEach((t) => {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    });
    gl.deleteProgram(this.simProgram);
    gl.deleteProgram(this.renderProgram);
    gl.deleteVertexArray(this.vao);
  }
}
