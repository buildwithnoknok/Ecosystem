// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 noknok / Christopher Houben
//
// noknok Display Planner - pixel-true renderer.
//
// A JavaScript port of the DRAWING part of brain-Pico/software/noknok.py (class Bitmap,
// class NoknokDisplay: clear / fill_rect / text / icon / image / region / set) plus the
// module firmware's DRAW_TEXT glyph painter (display_firmware.c: gpu_draw_glyph). The
// planner's preview is produced by THIS code, so every rule below mirrors noknok.py 1.9
// line for line: text routing (module 8x8 font vs Pico 8x16 font), cell widths, wrapping,
// box clipping, icon scaling, alignment. If noknok.py changes, change this too, then run
// test/golden.mjs - it renders the same layout through the real noknok.py (display_sim.py)
// and diffs the pixels.
//
// Works in the browser (global NDP) and in Node (module.exports) with no dependencies.
(function (root) {
  'use strict';
  const D = (typeof NDP_DATA !== 'undefined') ? NDP_DATA
          : (typeof require === 'function' ? require('./data.gen.js') : null);
  if (!D) throw new Error('render.js: data.gen.js must be loaded first');

  // ── colours (noknok.rgb565) ────────────────────────────────────────────────
  // A colour is 0xRRGGBB (int), [r,g,b], or a name from COLORS. Returns 0xRRGGBB.
  function toRGB(color) {
    if (typeof color === 'string') {
      const s = color.trim().toLowerCase().replace(/[\s_]/g, '');
      if (D.colors[s]) return D.colors[s].rgb;
      const hex = s.match(/^(?:0x|#)?([0-9a-f]{6})$/);
      if (hex) return parseInt(hex[1], 16);
      throw new Error('unknown colour name: ' + color);
    }
    if (Array.isArray(color)) {
      const c = v => Math.max(0, Math.min(255, v | 0));
      return (c(color[0]) << 16) | (c(color[1]) << 8) | c(color[2]);
    }
    return (color | 0) & 0xFFFFFF;
  }
  function rgb565(color) {
    const v = toRGB(color), r = (v >> 16) & 0xFF, g = (v >> 8) & 0xFF, b = v & 0xFF;
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
  }
  // 565 -> 0xRRGGBB for showing on screen (what the panel really shows: 5/6/5 bits)
  function rgb565to888(c) {
    const r = (c >> 11) & 0x1F, g = (c >> 5) & 0x3F, b = c & 0x1F;
    return ((r << 3 | r >> 2) << 16) | ((g << 2 | g >> 4) << 8) | (b << 3 | b >> 2);
  }

  // ── the Pico's 8x16 font (noknok._font8x16 / _glyph_index) ────────────────
  let _font16 = null;
  function b64decode(s) {
    const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const out = []; let bits = 0, acc = 0;
    for (const ch of s) {
      if (ch === '=') break;
      const v = T.indexOf(ch); if (v < 0) continue;
      acc = ((acc << 6) | v) & 0xFFFFFF; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xFF); }
    }
    return Uint8Array.from(out);
  }
  function font8x16() { return _font16 || (_font16 = b64decode(D.font8x16b64)); }
  function glyphIndex(ch) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c <= 126) return c - 32;
    if (c >= 160 && c <= 255) return 95 + (c - 160);
    return 63 - 32;                                   // '?'
  }

  // ── Bitmap (noknok.Bitmap): 1bpp, rows packed MSB-first, padded to bytes ───
  class Bitmap {
    constructor(width, height, data) {
      this.width = width | 0; this.height = height | 0;
      this.rowBytes = (this.width + 7) >> 3;
      const n = this.rowBytes * this.height;
      this.data = data ? Uint8Array.from(data) : new Uint8Array(n);
      if (this.data.length < n) throw new Error(`Bitmap needs ${n} bytes for ${width}x${height}`);
    }
    static fromRows(rows, on = '#') {
      const h = rows.length; let w = 0;
      for (const r of rows) if (r.length > w) w = r.length;
      const bm = new Bitmap(w, h);
      for (let y = 0; y < h; y++) {
        const row = rows[y], base = y * bm.rowBytes;
        for (let x = 0; x < row.length; x++)
          if (row[x] === on) bm.data[base + (x >> 3)] |= 0x80 >> (x & 7);
      }
      return bm;
    }
    get(x, y) {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
      return (this.data[y * this.rowBytes + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
    }
    set(x, y, on = true) {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
      const i = y * this.rowBytes + (x >> 3), m = 0x80 >> (x & 7);
      if (on) this.data[i] |= m; else this.data[i] &= ~m;
    }
    scaled(width, height) {                           // nearest-neighbour, like the Pico
      width |= 0; height |= 0;
      if (width === this.width && height === this.height) return this;
      const out = new Bitmap(width, height), sw = this.width, sh = this.height;
      for (let y = 0; y < height; y++) {
        const sy = Math.floor(y * sh / height), sbase = sy * this.rowBytes, obase = y * out.rowBytes;
        for (let x = 0; x < width; x++) {
          const sx = Math.floor(x * sw / width);
          if (this.data[sbase + (sx >> 3)] & (0x80 >> (sx & 7))) out.data[obase + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
      return out;
    }
    cropped(width, height) {
      if (width >= this.width && height >= this.height) return this;
      const out = new Bitmap(width, height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (this.get(x, y)) out.set(x, y);
      return out;
    }
    flipped() {                                       // mirrored top-to-bottom
      const out = new Bitmap(this.width, this.height), rb = this.rowBytes;
      for (let y = 0; y < this.height; y++) out.data.set(this.data.subarray((this.height - 1 - y) * rb, (this.height - y) * rb), y * rb);
      return out;
    }
    rotated() {                                       // 90 degrees clockwise
      const out = new Bitmap(this.height, this.width);
      for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) if (this.get(x, y)) out.set(this.height - 1 - y, x);
      return out;
    }
    mirrored() {                                      // left-to-right (planner extra, not in noknok.py)
      const out = new Bitmap(this.width, this.height);
      for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) if (this.get(x, y)) out.set(this.width - 1 - x, y);
      return out;
    }
    inverted() {
      const out = new Bitmap(this.width, this.height);
      for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) if (!this.get(x, y)) out.set(x, y);
      return out;
    }
    rows(on = '#', off = '.') {
      const out = [];
      for (let y = 0; y < this.height; y++) { let s = ''; for (let x = 0; x < this.width; x++) s += this.get(x, y) ? on : off; out.push(s); }
      return out;
    }
    count() { let n = 0; for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) if (this.get(x, y)) n++; return n; }
    // An uncompressed 1-bit Windows BMP (bottom-up, palette 0 = black, 1 = white) -
    // exactly what noknok.Bitmap.from_bmp() / d.image() / d.set(image=) read back.
    toBMP() {
      const w = this.width, h = this.height, stride = ((w + 31) >> 5) << 2;
      const size = 14 + 40 + 8 + stride * h, buf = new Uint8Array(size), dv = new DataView(buf.buffer);
      buf[0] = 0x42; buf[1] = 0x4D; dv.setUint32(2, size, true); dv.setUint32(10, 62, true);
      dv.setUint32(14, 40, true); dv.setInt32(18, w, true); dv.setInt32(22, h, true);
      dv.setUint16(26, 1, true); dv.setUint16(28, 1, true); dv.setUint32(30, 0, true);
      dv.setUint32(34, stride * h, true); dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true);
      dv.setUint32(46, 2, true); dv.setUint32(50, 2, true);
      buf.set([0, 0, 0, 0, 255, 255, 255, 0], 54);              // palette: 0 = black, 1 = white (= lit)
      for (let y = 0; y < h; y++) buf.set(this.data.subarray(y * this.rowBytes, y * this.rowBytes + this.rowBytes), 62 + (h - 1 - y) * stride);
      return buf;
    }
  }

  // ── built-in icons (noknok.icon_bitmap: three arrows are derived) ──────────
  const _iconCache = {};
  function builtinIconNames() {
    return Object.keys(D.icons).concat(['arrow_down', 'arrow_left', 'arrow_right']).sort();
  }
  function builtinIcon(name) {
    if (_iconCache[name]) return _iconCache[name];
    let bm;
    if (D.icons[name]) bm = Bitmap.fromRows(D.icons[name]);
    else if (name === 'arrow_down') bm = builtinIcon('arrow_up').flipped();
    else if (name === 'arrow_right') bm = builtinIcon('arrow_up').rotated();
    else if (name === 'arrow_left') bm = builtinIcon('arrow_up').rotated().rotated().rotated();
    else return null;
    return (_iconCache[name] = bm);
  }

  // ── the panel: an RGB565 frame that decodes like display_firmware.c ────────
  class Panel {
    constructor(w, h) { this.w = w; this.h = h; this.px = new Uint16Array(w * h); }
    fillRect(x, y, w, h, c) {                         // gpu_fill_rect (clips to the panel)
      if (x >= this.w || y >= this.h || w <= 0 || h <= 0) return;
      w = Math.min(w, this.w - x); h = Math.min(h, this.h - y);
      for (let yy = y; yy < y + h; yy++) this.px.fill(c, yy * this.w + x, yy * this.w + x + w);
    }
    drawGlyph(x, y, code, scale, fg, bg, transparent) {  // gpu_draw_glyph, 8x8 font, LSB = leftmost
      if (code < 0x20 || code > 0x7E) code = 0x3F;
      const rows = D.font8x8[code - 0x20];
      if (x >= this.w || y >= this.h) return;
      for (let r = 0; r < 8; r++) {
        const bits = rows[r];
        for (let c = 0; c < 8; c++) {
          const on = (bits >> c) & 1;
          if (transparent && !on) continue;
          this.fillRect(x + c * scale, y + r * scale, scale, scale, on ? fg : bg);
        }
      }
    }
    blit(x, y, w, h, fg, bg, transparent, data) {     // BLIT_BEGIN + BLIT_DATA (bm rows are byte padded)
      if (w === 0 || h === 0 || x + w > this.w || y + h > this.h) return;   // firmware: err 3, nothing drawn
      const rb = (w + 7) >> 3;
      for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) {
        const on = (data[row * rb + (col >> 3)] >> (7 - (col & 7))) & 1;
        if (transparent) { if (on) this.px[(y + row) * this.w + x + col] = fg; }
        else this.px[(y + row) * this.w + x + col] = on ? fg : bg;
      }
    }
    // Hex dump (4 hex digits per pixel, one line per row) - the golden test compares this
    // against display_sim.py's frame.
    dumpHex() {
      const out = [];
      for (let y = 0; y < this.h; y++) { let s = ''; for (let x = 0; x < this.w; x++) s += this.px[y * this.w + x].toString(16).padStart(4, '0'); out.push(s); }
      return out.join('\n');
    }
  }

  // ── NoknokDisplay's drawing subset ─────────────────────────────────────────
  const NATIVE_SIZES = { 8: 1, 16: 2, 24: 3, 32: 4, 40: 5, 48: 6, 56: 7, 64: 8 };
  const MAX_TEXT_CHARS = 60;

  class Display {
    // iconLookup(name) -> Bitmap|null lets the planner add the maker's own icons.
    constructor(w = 80, h = 160, iconLookup = null) {
      this.width = w; this.height = h;
      this.panel = new Panel(w, h);
      this._bg = 0x000000;                            // last clear() colour, like noknok.py
      this.nativeText = true;
      this._regions = {};
      this._icons = iconLookup || builtinIcon;
    }
    static isNativeSize(size) { return Object.prototype.hasOwnProperty.call(NATIVE_SIZES, size); }
    static isAscii(s) { for (const ch of s) { const c = ch.codePointAt(0); if (c < 32 || c > 126) return false; } return true; }
    static lineHeight(size, lineGap = null) { return size + Math.max(0, lineGap == null ? (size >> 3) : lineGap); }
    // how one character cell is drawn for `s` at `size`: {native: scale|null, cellW}
    route(s, size, allowNative = null) {
      if (allowNative == null) allowNative = this.nativeText;
      let native = null;
      if (allowNative && Display.isNativeSize(size) && Display.isAscii(s.replace(/\n/g, ''))) native = NATIVE_SIZES[size];
      const cellW = native ? 8 * native : Math.max(1, (size + 1) >> 1);
      return { native, cellW };
    }
    static layout(s, cellW, availPx, wrap) {          // noknok._layout
      const maxChars = Math.max(1, Math.floor(availPx / cellW)), out = [];
      for (let para of s.split('\n')) {
        if (!wrap) { out.push(para.slice(0, maxChars)); continue; }
        if (!para) { out.push(''); continue; }
        while (para.length > maxChars) {
          let cut = para.lastIndexOf(' ', maxChars);   // rfind(" ", 0, max_chars+1)
          if (cut <= 0) cut = maxChars;
          out.push(para.slice(0, cut).replace(/\s+$/, ''));
          para = para.slice(cut).replace(/^\s+/, '');
        }
        out.push(para);
      }
      return out;
    }
    _bgValue(bg) {                                    // {bgc, transparent}
      if (bg == null) return { bgc: rgb565(this._bg), transparent: true };
      if (bg === 'auto') return { bgc: rgb565(this._bg), transparent: false };
      return { bgc: rgb565(bg), transparent: false };
    }
    clip(x, y, w, h) {                                // noknok._clip
      const dw = this.width, dh = this.height;
      x |= 0; y |= 0; w |= 0; h |= 0;
      if (x < 0) { w += x; x = 0; }
      if (y < 0) { h += y; y = 0; }
      if (x >= dw || y >= dh) return [0, 0, 0, 0];
      w = Math.min(w, dw - x, 255); h = Math.min(h, dh - y, 255);
      return [x, y, Math.max(0, w), Math.max(0, h)];
    }
    clear(color = 0x000000) { this._bg = toRGB(color); this.panel.fillRect(0, 0, this.width, this.height, rgb565(this._bg)); }
    fillRect(x, y, w, h, color) { const [cx, cy, cw, ch] = this.clip(x, y, w, h); if (cw > 0 && ch > 0) this.panel.fillRect(cx, cy, cw, ch, rgb565(color)); }

    icon(bm, x = 0, y = 0, { scale = 1, size = null, color = 0xFFFFFF, bg = 'auto' } = {}) {
      if (typeof bm === 'string') bm = this._icons(bm);
      if (!bm) return y;
      const h = size != null ? (size | 0) : bm.height * Math.max(1, scale | 0);
      const w = Math.max(1, Math.floor(bm.width * h / Math.max(1, bm.height)));
      this._blitBitmap(bm, x, y, w, h, color, bg);
      return (y | 0) + h;
    }
    image(bm, x = 0, y = 0, { w = null, h = null, color = 0xFFFFFF, bg = 'auto' } = {}) {
      if (w == null && h == null) { w = bm.width; h = bm.height; }
      else if (h == null) h = Math.max(1, Math.floor(bm.height * (w | 0) / Math.max(1, bm.width)));
      else if (w == null) w = Math.max(1, Math.floor(bm.width * (h | 0) / Math.max(1, bm.height)));
      this._blitBitmap(bm, x, y, w | 0, h | 0, color, bg);
      return (y | 0) + (h | 0);
    }
    _blitBitmap(bm, x, y, w, h, color, bg) {         // noknok._blit_bitmap
      const fg = rgb565(color), { bgc, transparent } = this._bgValue(bg);
      x = Math.max(0, x | 0); y = Math.max(0, y | 0);
      const cw = Math.min(w, this.width - x, 255), ch = Math.min(h, this.height - y, 255);
      if (cw <= 0 || ch <= 0) return;
      if (w !== bm.width || h !== bm.height) bm = bm.scaled(w, h);
      bm = bm.cropped(cw, ch);
      this.panel.blit(x, y, cw, ch, fg, bgc, transparent, bm.data);
    }

    text(s, { size = 16, color = 0xFFFFFF, bg = 'auto', x = 0, y = 0, wrap = true, lineGap = null, maxW = null, maxH = null, native = null } = {}) {
      s = String(s); size |= 0;
      if (size < 1) throw new Error('size must be at least 1 pixel tall');
      const fg = rgb565(color), { bgc, transparent } = this._bgValue(bg);
      const { native: nat, cellW } = this.route(s, size, native);
      x |= 0; y |= 0;
      let avail = this.width - x;
      if (maxW != null) avail = Math.min(avail, maxW | 0);
      avail = Math.max(1, avail);
      const lines = Display.layout(s, cellW, avail, wrap);
      const lineH = Display.lineHeight(size, lineGap);
      const bottom = maxH == null ? this.height : Math.min(this.height, y + (maxH | 0));
      let curY = y;
      for (const line of lines) {
        if (curY >= this.height) break;
        if (maxH != null && curY + size > bottom) break;
        if (line) {
          if (nat) this._textNative(x, curY, line, fg, bgc, transparent, nat);
          else this._textBlit(x, curY, line, size, cellW, fg, bgc, transparent, avail);
        }
        curY += lineH;
      }
      return curY;
    }
    _textNative(x, y, line, fg, bg, transparent, scale) {   // DRAW_TEXT as the firmware executes it
      line = line.slice(0, MAX_TEXT_CHARS);
      x &= 0xFF; y &= 0xFF;
      for (let i = 0; i < line.length; i++) {
        const cx = x + i * 8 * scale;
        if (cx >= this.panel.w) break;
        this.panel.drawGlyph(cx, y, line.charCodeAt(i) & 0xFF, scale, fg, bg, transparent);
      }
    }
    _textBlit(x, y, line, size, cellW, fg, bg, transparent, maxW = null) {   // Pico-rendered 8x16 font, blitted
      let w = Math.min(cellW * line.length, Math.max(0, this.width - x), 255);
      if (maxW != null) w = Math.min(w, Math.max(0, maxW | 0));
      const h = Math.min(size, Math.max(0, this.height - y), 255);
      if (w <= 0 || h <= 0) return;
      const table = font8x16(), rowBytes = (w + 7) >> 3, buf = new Uint8Array(rowBytes * h);
      const chars = Array.from(line);
      for (let i = 0; i < chars.length; i++) {
        const baseX = i * cellW;
        if (baseX >= w) break;
        const off = glyphIndex(chars[i]) * 16;
        for (let dy = 0; dy < h; dy++) {
          let sy = Math.floor(dy * 16 / size); if (sy >= 16) sy = 15;
          const src = table[off + sy];
          if (!src) continue;
          const rowBase = dy * rowBytes;
          for (let dx = 0; dx < cellW; dx++) {
            const px = baseX + dx;
            if (px >= w) break;
            const sx = Math.floor(dx * 8 / cellW);
            if (src & (1 << (7 - sx))) buf[rowBase + (px >> 3)] |= 0x80 >> (px & 7);
          }
        }
      }
      this.panel.blit(x, y, w, h, fg, bg, transparent, buf);
    }

    region(name, x, y, w, h, { size = 16, color = 0xFFFFFF, bg = 'auto', align = 'left' } = {}) {
      [x, y, w, h] = this.clip(x, y, w, h);
      if (w <= 0 || h <= 0) throw new Error(`region ${name} is off the panel`);
      this._regions[name] = { x, y, w, h, size: size | 0, color, bg, align };
      return name;
    }
    static alignOffset(align, boxW, contentW) {
      if (align === 'center') return Math.max(0, (boxW - contentW) >> 1);
      if (align === 'right') return Math.max(0, boxW - contentW);
      return 0;
    }
    set(name, { text = null, icon = null, image = null, size = null, color = null, align = null, bg = null } = {}) {
      const r = this._regions[name];
      if (!r) throw new Error(`no region ${name}`);
      const { x, y, w, h } = r;
      size = size == null ? r.size : size | 0;
      color = color == null ? r.color : color;
      align = align == null ? r.align : align;
      bg = bg == null ? r.bg : bg;
      const bgCol = (bg == null || bg === 'auto') ? this._bg : bg;    // regions are always opaque
      this.fillRect(x, y, w, h, bgCol);
      if (text != null) {
        text = String(text);
        const { cellW } = this.route(text, size);
        const first = text.split('\n')[0];
        const cw = Math.min(Array.from(first).length * cellW, w);
        this.text(text, { size, color, bg: bgCol, x: x + Display.alignOffset(align, w, cw), y, maxW: w, maxH: h });
      } else if (icon != null) {
        const bm = typeof icon === 'string' ? this._icons(icon) : icon;
        if (!bm) return;
        const ih = Math.min(size, h);
        let iw = Math.max(1, Math.floor(bm.width * ih / Math.max(1, bm.height)));
        iw = Math.min(iw, w);
        this._blitBitmap(bm, x + Display.alignOffset(align, w, iw), y, iw, ih, color, bgCol);
      } else if (image != null) {
        const bm = image, iw = Math.min(bm.width, w), ih = Math.min(bm.height, h);
        this._blitBitmap(bm.cropped(iw, ih), x + Display.alignOffset(align, w, iw), y, iw, ih, color, bgCol);
      }
    }
    // Text-fit info for the planner: how many columns x lines a box gives at `size`.
    static textFit(w, h, size, ascii = true, nativeAllowed = true) {
      const native = nativeAllowed && Display.isNativeSize(size) && ascii;
      const cellW = native ? size : Math.max(1, (size + 1) >> 1);
      const lineH = Display.lineHeight(size);
      const cols = Math.floor(Math.min(w, 255) / cellW);
      const lines = h >= size ? Math.floor((h - size) / lineH) + 1 : 0;
      return { native, cellW, lineH, cols, lines };
    }
  }

  const NDP = { D, toRGB, rgb565, rgb565to888, Bitmap, Panel, Display, builtinIcon, builtinIconNames, NATIVE_SIZES, font8x16, glyphIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = NDP;
  root.NDP = NDP;
})(typeof globalThis !== 'undefined' ? globalThis : this);
