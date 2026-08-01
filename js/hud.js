'use strict';
/* ============================================================================
   hud.js — DOM-driven interface: readouts, world markers, toasts, system map.

   Kept out of the render loop deliberately: text nodes are only touched when
   the value they display actually changes.
   ============================================================================ */

const $ = (id) => document.getElementById(id);

const HUD = {
  el: {},
  _cache: {},
  markers: new Map(),
  toasts: [],

  init(game) {
    this.game = game;
    const ids = ['hud', 'planetName', 'planetType', 'planetStats', 'systemName',
      'targetName', 'targetDist', 'speedVal', 'speedUnit', 'altVal', 'altUnit',
      'altFill', 'throttleFill', 'throttleBar', 'throttleLabel', 'envVal',
      'atmoVal', 'lifeVal', 'prompt', 'promptKey', 'promptText', 'toasts',
      'discovery', 'discName', 'discSub', 'markers', 'arcFill', 'reticle',
      'vignette', 'fps', 'mapOverlay', 'mapCanvas', 'mapSystem', 'mapInfo',
      'statusPanel', 'flightPanel', 'planetPanel', 'systemPanel'];
    for (const id of ids) this.el[id] = $(id);
    this.mapCtx = this.el.mapCanvas.getContext('2d');
    this.el.mapCanvas.addEventListener('click', (e) => this.onMapClick(e));
    this.el.mapCanvas.addEventListener('mousemove', (e) => this.onMapHover(e));
  },

  set(id, value) {
    if (this._cache[id] === value) return;
    this._cache[id] = value;
    this.el[id].textContent = value;
  },

  show(on) { this.el.hud.classList.toggle('on', on); },
  setHidden(h) { this.el.hud.classList.toggle('hidden', h); },

  /* ------------------------------------------------------------- format -- */
  dist(m) {
    if (m === null || m === undefined || !isFinite(m)) return ['—', ''];
    const a = Math.abs(m);
    if (a >= 1e9) return [(m / 1e9).toFixed(2), 'Gm'];
    if (a >= 1e6) return [(m / 1e6).toFixed(2), 'Mm'];
    if (a >= 10000) return [(m / 1000).toFixed(1), 'km'];
    if (a >= 1000) return [(m / 1000).toFixed(2), 'km'];
    return [Math.round(m).toString(), 'm'];
  },

  speed(v) {
    if (v >= 100000) return [(v / 1000).toFixed(0), 'km/s'];
    if (v >= 1500) return [(v / 1000).toFixed(2), 'km/s'];
    return [Math.round(v).toString(), 'm/s'];
  },

  /* ------------------------------------------------------------- update -- */
  update(game) {
    const p = game.activePlanet;
    const onFoot = game.mode === 'foot';
    const actor = onFoot ? game.player : game.ship;

    /* ---- planet panel ---- */
    if (p) {
      this.set('planetName', p.name.toUpperCase());
      this.set('planetType', p.biome.label + ' · ' + p.biome.climate);
      const key = p.index + '|' + (p.discovered ? 1 : 0);
      if (this._statKey !== key) {
        this._statKey = key;
        const hazardClass = p.biome.hazard === 'None Detected' ? 'ok' : 'warn';
        this.el.planetStats.innerHTML = `
          <div class="stat">Weather<b>${p.weather}</b></div>
          <div class="stat">Gravity<b>${p.gravity.toFixed(1)} m/s²</b></div>
          <div class="stat">Flora<b>${p.biome.flora}</b></div>
          <div class="stat">Fauna<b>${p.biome.fauna}</b></div>
          <div class="stat ${hazardClass}">Hazard<b>${p.biome.hazard}</b></div>
          <div class="stat">Resource<b>${p.resource}</b></div>`;
      }
    } else {
      this.set('planetName', 'DEEP SPACE');
      this.set('planetType', 'INTERPLANETARY');
      if (this._statKey !== 'void') {
        this._statKey = 'void';
        this.el.planetStats.innerHTML = `
          <div class="stat">Region<b>${game.system.name}</b></div>
          <div class="stat">Worlds<b>${game.system.planets.length}</b></div>
          <div class="stat">Discovered<b>${game.system.planets.filter(x => x.discovered).length}</b></div>
          <div class="stat ok">Status<b>Nominal</b></div>`;
      }
    }

    /* ---- system / target ---- */
    this.set('systemName', game.system.name);
    if (game.target) {
      this.set('targetName', game.target.name.toUpperCase());
      const d = this.dist(V3.dist(game.camPos, game.target.pos) - game.target.radius);
      this.set('targetDist', d[0] + ' ' + d[1]);
    } else {
      this.set('targetName', 'NONE');
      this.set('targetDist', '—');
    }

    /* ---- flight panel ---- */
    const sp = this.speed(actor.speed || 0);
    this.set('speedVal', sp[0]);
    this.set('speedUnit', sp[1]);

    let alt = null;
    if (p) alt = onFoot ? game.player.altitude : game.ship.altitude;
    if (alt !== null && alt < 1e8) {
      const a = this.dist(alt);
      this.set('altVal', a[0]);
      this.set('altUnit', a[1]);
      const frac = clamp(1 - Math.log10(Math.max(alt, 1) + 1) / 5.2, 0, 1);
      this.el.altFill.style.right = (100 - frac * 100).toFixed(1) + '%';
    } else {
      this.set('altVal', '—');
      this.set('altUnit', '');
      this.el.altFill.style.right = '100%';
    }

    if (onFoot) {
      this.set('throttleLabel', 'Jetpack');
      const f = game.player.jetFuel / FOOT.jetFuelMax;
      this.el.throttleFill.style.right = (100 - f * 100).toFixed(1) + '%';
      this.el.throttleBar.classList.remove('pulse');
      this.el.arcFill.style.strokeDashoffset = 188.5;
    } else {
      const pulsing = game.ship.pulse > 0.02;
      this.set('throttleLabel', pulsing ? 'Pulse Drive' : 'Throttle');
      const t = pulsing ? game.ship.pulse : game.ship.throttle;
      this.el.throttleFill.style.right = (100 - t * 100).toFixed(1) + '%';
      this.el.throttleBar.classList.toggle('pulse', pulsing);
      this.el.arcFill.style.strokeDashoffset = (188.5 * (1 - t)).toFixed(1);
    }
    this.el.reticle.classList.toggle('foot', onFoot);

    /* ---- environment ---- */
    if (p) {
      const density = p.densityAt(onFoot ? Math.max(game.player.altitude, 0) : Math.max(game.ship.altitude, 0));
      this.set('envVal', p.biome.label.toUpperCase());
      this.set('atmoVal', p.isAirless ? 'VACUUM' : (density * 100).toFixed(0) + '%');
      const risky = p.biome.hazard !== 'None Detected' && (onFoot || game.ship.landed);
      this.set('lifeVal', risky ? 'SHIELDED' : 'NOMINAL');
      this.el.lifeVal.style.color = risky ? 'var(--amber)' : 'var(--ok)';
    } else {
      this.set('envVal', 'VACUUM');
      this.set('atmoVal', '0%');
      this.set('lifeVal', 'NOMINAL');
      this.el.lifeVal.style.color = 'var(--ok)';
    }

    this.updateMarkers(game);
    this.updatePrompt(game);
  },

  /* ------------------------------------------------------------ markers -- */
  updateMarkers(game) {
    const seen = new Set();
    const w = game.width, h = game.height;

    const place = (key, worldPos, label, distText, cls, selected) => {
      const s = game.projectToScreen(worldPos);
      let m = this.markers.get(key);
      if (!s || s.behind) {
        if (m) m.style.opacity = '0';
        seen.add(key);
        return;
      }
      if (!m) {
        m = document.createElement('div');
        m.className = 'marker ' + (cls || '');
        m.innerHTML = '<div class="ring"></div><div class="lbl"></div><div class="dist"></div>';
        this.el.markers.appendChild(m);
        this.markers.set(key, m);
      }
      const margin = 34;
      const x = clamp(s.x, margin, w - margin);
      const y = clamp(s.y, margin, h - margin);
      m.style.left = x + 'px';
      m.style.top = y + 'px';
      m.style.opacity = '1';
      const lbl = m.children[1], dst = m.children[2];
      if (lbl.textContent !== label) lbl.textContent = label;
      if (dst.textContent !== distText) dst.textContent = distText;
      m.children[0].classList.toggle('sel', !!selected);
      seen.add(key);
    };

    for (const pl of game.system.planets) {
      const d = V3.dist(game.camPos, pl.pos);
      /* Suppress the marker once we're basically on top of the world. */
      if (d < pl.radius * 1.6) { const m = this.markers.get('p' + pl.index); if (m) m.style.opacity = '0'; seen.add('p' + pl.index); continue; }
      const dd = this.dist(d - pl.radius);
      place('p' + pl.index, pl.pos,
        pl.discovered ? pl.name.toUpperCase() : 'UNCHARTED',
        dd[0] + ' ' + dd[1], '', game.target === pl);
    }

    if (game.mode === 'foot') {
      const d = V3.dist(game.camPos, game.ship.pos);
      const dd = this.dist(d);
      place('ship', game.ship.pos, 'STARSHIP', dd[0] + ' ' + dd[1], 'ship', false);
    } else {
      const m = this.markers.get('ship');
      if (m) m.style.opacity = '0';
      seen.add('ship');
    }

    for (const [k, m] of this.markers) if (!seen.has(k)) m.style.opacity = '0';
  },

  /* ------------------------------------------------------------- prompt -- */
  updatePrompt(game) {
    let key = null, text = null;
    if (game.mode === 'foot') {
      if (game.player.nearShip) { key = 'E'; text = 'Board Starship'; }
    } else if (game.ship.landed) {
      key = 'E'; text = 'Disembark — F to launch';
    } else if (game.ship.canLand && !game.ship.landing) {
      key = 'F'; text = 'Land';
    }
    const on = key !== null;
    this.el.prompt.classList.toggle('on', on);
    if (on) {
      this.set('promptKey', key);
      this.set('promptText', text);
    }
  },

  /* -------------------------------------------------------------- toast -- */
  toast(msg, kind) {
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    this.el.toasts.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 450);
    }, 2600);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  },

  discovery(planet) {
    this.el.discName.textContent = planet.name.toUpperCase();
    this.el.discSub.textContent = planet.biome.label + ' World · ' + planet.biome.climate +
      ' · ' + (planet.hasWater ? 'Hydrated' : 'Anhydrous');
    this.el.discovery.classList.remove('on');
    void this.el.discovery.offsetWidth;     // restart the animation
    this.el.discovery.classList.add('on');
  },

  flashDamage(amount) {
    this.el.vignette.style.opacity = Math.min(amount, 0.9).toFixed(2);
    clearTimeout(this._vigT);
    this._vigT = setTimeout(() => { this.el.vignette.style.opacity = '0'; }, 130);
  },

  stats(text) { this.el.fps.textContent = text; },

  /* ---------------------------------------------------------- system map -- */
  openMap(on) {
    this.el.mapOverlay.classList.toggle('on', on);
    if (on) { this.el.mapSystem.textContent = this.game.system.name; this.drawMap(); }
  },

  mapLayout() {
    const g = this.game, c = this.el.mapCanvas;
    const maxOrbit = Math.max(...g.system.planets.map(p => this.orbitRadius(p.pos))) * 1.12;
    const cx = c.width * 0.5, cy = c.height * 0.5;
    const scale = Math.min(c.width, c.height * 2) * 0.44 / maxOrbit;
    return { cx, cy, scale, maxOrbit };
  },

  /* Straight top-down projection foreshortened in Z.  Adding an inclination
     offset here would push planets off the flat orbit ellipses drawn below. */
  mapPos(worldPos, L) {
    return {
      x: L.cx + worldPos[0] * L.scale,
      y: L.cy + worldPos[2] * L.scale * 0.5
    };
  },

  orbitRadius(worldPos) { return Math.hypot(worldPos[0], worldPos[2]); },

  drawMap(hoverIdx) {
    const g = this.game, ctx = this.mapCtx, c = this.el.mapCanvas;
    const L = this.mapLayout();
    ctx.clearRect(0, 0, c.width, c.height);

    // orbit rings
    ctx.lineWidth = 1;
    for (const p of g.system.planets) {
      const r = this.orbitRadius(p.pos) * L.scale;
      ctx.strokeStyle = 'rgba(255,161,66,.12)';
      ctx.beginPath();
      ctx.ellipse(L.cx, L.cy, r, r * 0.5, 0, 0, TAU);
      ctx.stroke();
    }

    // star
    const sc = g.system.starColor;
    const rgb = `rgb(${(sc[0] * 255) | 0},${(sc[1] * 255) | 0},${(sc[2] * 255) | 0})`;
    const grd = ctx.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, 60);
    grd.addColorStop(0, rgb);
    grd.addColorStop(0.35, rgb.replace('rgb', 'rgba').replace(')', ',.5)'));
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(L.cx, L.cy, 60, 0, TAU); ctx.fill();

    // planets
    this._mapHit = [];
    for (const p of g.system.planets) {
      const s = this.mapPos(p.pos, L);
      const r = 7 + (p.radius / 95000) * 12;
      this._mapHit.push({ x: s.x, y: s.y, r: r + 14, planet: p });

      const col = p.biome.col.low;
      ctx.fillStyle = `rgb(${(col[0] * 255) | 0},${(col[1] * 255) | 0},${(col[2] * 255) | 0})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();

      if (p === g.target || p.index === hoverIdx) {
        ctx.strokeStyle = p === g.target ? '#63e3ff' : 'rgba(255,255,255,.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, r + 9, 0, TAU); ctx.stroke();
      }
      if (p === g.activePlanet) {
        ctx.strokeStyle = 'rgba(255,161,66,.85)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(s.x, s.y, r + 15, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.fillStyle = p.discovered ? 'rgba(232,242,248,.85)' : 'rgba(232,242,248,.35)';
      ctx.font = '20px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.discovered ? p.name.toUpperCase() : '— UNCHARTED —', s.x, s.y + r + 30);
    }

    // the player
    const ps = this.mapPos(g.camPos, L);
    ctx.strokeStyle = '#ffa142';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ps.x, ps.y - 10); ctx.lineTo(ps.x + 8, ps.y + 8);
    ctx.lineTo(ps.x, ps.y + 3); ctx.lineTo(ps.x - 8, ps.y + 8);
    ctx.closePath(); ctx.stroke();
  },

  mapPick(e) {
    const c = this.el.mapCanvas, r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) * (c.width / r.width);
    const y = (e.clientY - r.top) * (c.height / r.height);
    let best = null, bestD = 1e9;
    for (const h of this._mapHit || []) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < h.r && d < bestD) { bestD = d; best = h.planet; }
    }
    return best;
  },

  onMapClick(e) {
    const p = this.mapPick(e);
    if (!p) return;
    this.game.setTarget(p);
    this.drawMap(p.index);
    this.el.mapInfo.innerHTML = `Target set: <b style="color:var(--cyan)">${p.name.toUpperCase()}</b>`;
  },

  onMapHover(e) {
    const p = this.mapPick(e);
    const idx = p ? p.index : -1;
    if (idx !== this._hoverIdx) {
      this._hoverIdx = idx;
      this.drawMap(idx);
      this.el.mapInfo.innerHTML = p
        ? `${p.discovered ? p.name.toUpperCase() : 'UNCHARTED WORLD'} — ${p.biome.label} · ${p.biome.climate}<br>
           <span style="opacity:.6">Radius ${(p.radius / 1000).toFixed(0)} km · Gravity ${p.gravity.toFixed(1)} m/s² ·
           ${p.hasWater ? 'Liquid water' : 'No surface water'}</span>`
        : 'Select a world to set a navigation target.';
    }
  }
};
