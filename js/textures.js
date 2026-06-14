/* ============================================================
 * TEXTURES — Génération procédurale (couleur + normal + rugosité)
 * Donne du relief réaliste aux murs/sols sous l'éclairage dynamique
 * ============================================================ */

const Textures = {
  cache: {},

  _canvas(size) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  },

  // Dérive une normal map d'une height map (Sobel, tuilable)
  _normalFromHeight(heightCanvas, strength) {
    const s = heightCanvas.width;
    const hc = heightCanvas.getContext("2d");
    const hd = hc.getImageData(0, 0, s, s).data;
    const out = this._canvas(s);
    const oc = out.getContext("2d");
    const od = oc.createImageData(s, s);
    const H = (x, y) => {
      x = (x + s) % s; y = (y + s) % s;
      return hd[(y * s + x) * 4] / 255;
    };
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (H(x - 1, y) - H(x + 1, y)) * strength;
        const dy = (H(x, y - 1) - H(x, y + 1)) * strength;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * s + x) * 4;
        od.data[i]     = ((dx / len) * 0.5 + 0.5) * 255;
        od.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
        od.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        od.data[i + 3] = 255;
      }
    }
    oc.putImageData(od, 0, 0);
    return out;
  },

  // Rugosité issue de la height (creux = plus rugueux)
  _roughFromHeight(heightCanvas, base, range) {
    const s = heightCanvas.width;
    const hc = heightCanvas.getContext("2d");
    const hd = hc.getImageData(0, 0, s, s).data;
    const out = this._canvas(s);
    const oc = out.getContext("2d");
    const od = oc.createImageData(s, s);
    for (let i = 0; i < hd.length; i += 4) {
      const h = hd[i] / 255;
      const r = Math.max(0, Math.min(255, (base - h * range) * 255));
      od.data[i] = od.data[i + 1] = od.data[i + 2] = r;
      od.data[i + 3] = 255;
    }
    oc.putImageData(od, 0, 0);
    return out;
  },

  _tex(canvas, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  },

  // Mur de pierre (briques irrégulières)
  stone() {
    if (this.cache.stone) return this.cache.stone;
    const S = 256, color = this._canvas(S), height = this._canvas(S);
    const cc = color.getContext("2d"), hc = height.getContext("2d", { willReadFrequently: true });
    cc.fillStyle = "#3a3a40"; cc.fillRect(0, 0, S, S);
    hc.fillStyle = "#202020"; hc.fillRect(0, 0, S, S); // mortier = bas

    const rows = 6, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      const cols = 4, cw = S / cols;
      const off = (r % 2) * cw / 2;
      for (let c = -1; c < cols; c++) {
        const bx = c * cw + off + 3, by = r * rh + 3, bw = cw - 6, bh = rh - 6;
        const shade = 52 + Math.floor(Math.random() * 30);
        cc.fillStyle = `rgb(${shade + 6},${shade + 4},${shade})`;
        cc.fillRect(bx, by, bw, bh);
        // grain de la brique
        for (let k = 0; k < 60; k++) {
          const gx = bx + Math.random() * bw, gy = by + Math.random() * bh;
          const v = Math.random() * 40 - 20;
          cc.fillStyle = `rgba(${shade + v},${shade + v},${shade + v},0.25)`;
          cc.fillRect(gx, gy, 2, 2);
        }
        const hv = 150 + Math.floor(Math.random() * 60);
        hc.fillStyle = `rgb(${hv},${hv},${hv})`;
        hc.fillRect(bx, by, bw, bh);
      }
    }
    // taches d'humidité / mousse
    for (let k = 0; k < 40; k++) {
      cc.fillStyle = `rgba(${20 + Math.random() * 30},${40 + Math.random() * 30},${20},${Math.random() * 0.18})`;
      const rx = Math.random() * S, ry = Math.random() * S, rr = 10 + Math.random() * 30;
      cc.beginPath(); cc.arc(rx, ry, rr, 0, 7); cc.fill();
    }
    const res = {
      map: this._tex(color, true),
      normalMap: this._tex(this._normalFromHeight(height, 2.2), false),
      roughnessMap: this._tex(this._roughFromHeight(height, 0.98, 0.35), false),
    };
    this.cache.stone = res; return res;
  },

  // Sol en dalles
  floor() {
    if (this.cache.floor) return this.cache.floor;
    const S = 256, color = this._canvas(S), height = this._canvas(S);
    const cc = color.getContext("2d"), hc = height.getContext("2d", { willReadFrequently: true });
    cc.fillStyle = "#26241f"; cc.fillRect(0, 0, S, S);
    hc.fillStyle = "#404040"; hc.fillRect(0, 0, S, S);
    const n = 4, t = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const sh = 30 + Math.floor(Math.random() * 22);
      cc.fillStyle = `rgb(${sh + 4},${sh + 2},${sh - 4})`;
      cc.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      for (let k = 0; k < 80; k++) {
        const v = Math.random() * 30 - 15;
        cc.fillStyle = `rgba(${sh + v},${sh + v},${sh + v - 4},0.3)`;
        cc.fillRect(i * t + Math.random() * t, j * t + Math.random() * t, 2, 2);
      }
      const hv = 120 + Math.floor(Math.random() * 80);
      hc.fillStyle = `rgb(${hv},${hv},${hv})`;
      hc.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
    }
    // fissures sombres
    cc.strokeStyle = "rgba(0,0,0,0.4)"; cc.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      cc.beginPath(); cc.moveTo(Math.random() * S, Math.random() * S);
      for (let s2 = 0; s2 < 4; s2++) cc.lineTo(Math.random() * S, Math.random() * S);
      cc.stroke();
    }
    const res = {
      map: this._tex(color, true),
      normalMap: this._tex(this._normalFromHeight(height, 1.6), false),
      roughnessMap: this._tex(this._roughFromHeight(height, 0.96, 0.25), false),
    };
    this.cache.floor = res; return res;
  },

  // Plafond (poutres + plâtre sombre)
  ceiling() {
    if (this.cache.ceiling) return this.cache.ceiling;
    const S = 256, color = this._canvas(S), height = this._canvas(S);
    const cc = color.getContext("2d"), hc = height.getContext("2d", { willReadFrequently: true });
    cc.fillStyle = "#1c1a17"; cc.fillRect(0, 0, S, S);
    hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) {
      const y = i * S / 4;
      cc.fillStyle = "#2a2018"; cc.fillRect(0, y, S, 14);
      hc.fillStyle = "#404040"; hc.fillRect(0, y, S, 14);
    }
    for (let k = 0; k < 400; k++) {
      const v = Math.random() * 20;
      cc.fillStyle = `rgba(${v},${v},${v},0.3)`;
      cc.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
    const res = {
      map: this._tex(color, true),
      normalMap: this._tex(this._normalFromHeight(height, 1.2), false),
      roughnessMap: null,
    };
    this.cache.ceiling = res; return res;
  },

  // Bois (portes)
  wood() {
    if (this.cache.wood) return this.cache.wood;
    const S = 256, color = this._canvas(S), height = this._canvas(S);
    const cc = color.getContext("2d"), hc = height.getContext("2d", { willReadFrequently: true });
    cc.fillStyle = "#4a3320"; cc.fillRect(0, 0, S, S);
    hc.fillStyle = "#a0a0a0"; hc.fillRect(0, 0, S, S);
    const planks = 5, pw = S / planks;
    for (let i = 0; i < planks; i++) {
      const base = 50 + Math.floor(Math.random() * 20);
      cc.fillStyle = `rgb(${base + 16},${base},${base - 24})`;
      cc.fillRect(i * pw + 1, 0, pw - 2, S);
      // veines
      cc.strokeStyle = `rgba(${base - 20},${base - 24},${base - 36},0.5)`;
      cc.lineWidth = 1;
      for (let v = 0; v < 8; v++) {
        cc.beginPath();
        const x = i * pw + Math.random() * pw;
        cc.moveTo(x, 0);
        for (let y = 0; y < S; y += 16) cc.lineTo(x + Math.sin(y * 0.1 + v) * 2, y);
        cc.stroke();
      }
      hc.fillStyle = "#303030"; hc.fillRect(i * pw, 0, 2, S); // sillon
    }
    const res = {
      map: this._tex(color, true),
      normalMap: this._tex(this._normalFromHeight(height, 1.4), false),
      roughnessMap: null,
    };
    this.cache.wood = res; return res;
  },

  // Flamme (sprite radial additif)
  flame() {
    if (this.cache.flame) return this.cache.flame;
    const S = 64, c = this._canvas(S), ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(255,240,180,1)");
    g.addColorStop(0.3, "rgba(255,160,40,0.9)");
    g.addColorStop(0.7, "rgba(200,60,10,0.4)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    this.cache.flame = new THREE.CanvasTexture(c);
    return this.cache.flame;
  },

  // Tache de sang (decal sol)
  blood() {
    if (this.cache.blood) return this.cache.blood;
    const S = 128, c = this._canvas(S), ctx = c.getContext("2d");
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = "rgba(70,8,8,0.9)";
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.3, 0, 7); ctx.fill();
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * 7, d = Math.random() * S * 0.45;
      ctx.globalAlpha = 0.5 + Math.random() * 0.4;
      ctx.beginPath();
      ctx.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 2 + Math.random() * 8, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.cache.blood = new THREE.CanvasTexture(c);
    return this.cache.blood;
  },
};
