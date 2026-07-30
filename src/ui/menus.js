/* ============================================================
   Menus — title, mode, character select, stage select, pause,
   results. Portraits and stage thumbnails are drawn on 2D
   canvases from the same palettes the 3D models use.
   ============================================================ */
import { ROSTER } from '../characters/roster.js';
import { STAGES, stagePreviewColors } from '../stages/stages.js';
import { DIFFICULTIES } from '../game/ai.js';
import { TAU, clamp, rand } from '../core/utils.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

/* ---------------- portrait painter ---------------- */

export function portrait(spec, w = 220, h = 250) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const P = spec.palette;

  // background
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, hex(P.aura));
  g.addColorStop(0.55, '#0b1020');
  g.addColorStop(1, '#05070f');
  x.fillStyle = g; x.fillRect(0, 0, w, h);

  x.save();
  x.globalAlpha = 0.16;
  x.strokeStyle = '#fff'; x.lineWidth = w * 0.05;
  for (let i = -2; i < 8; i++) {
    x.beginPath();
    x.moveTo(i * w * 0.22, h);
    x.lineTo(i * w * 0.22 + w * 0.35, 0);
    x.stroke();
  }
  x.restore();

  // radial glow behind the head
  const rg = x.createRadialGradient(w * 0.5, h * 0.42, 2, w * 0.5, h * 0.42, w * 0.55);
  rg.addColorStop(0, hex(P.aura) + 'cc');
  rg.addColorStop(1, 'transparent');
  x.fillStyle = rg; x.fillRect(0, 0, w, h);

  const cx = w * 0.5, cy = h * 0.46, r = w * 0.21;

  // shoulders / gi
  x.fillStyle = hex(P.primary);
  x.beginPath();
  x.moveTo(cx - r * 2.5, h);
  x.quadraticCurveTo(cx - r * 1.5, h * 0.72, cx, h * 0.72);
  x.quadraticCurveTo(cx + r * 1.5, h * 0.72, cx + r * 2.5, h);
  x.closePath(); x.fill();
  x.fillStyle = hex(P.secondary);
  x.beginPath();
  x.moveTo(cx - r * 0.8, h * 0.72);
  x.lineTo(cx, h * 0.92); x.lineTo(cx + r * 0.8, h * 0.72);
  x.closePath(); x.fill();

  // neck + head
  x.fillStyle = hex(P.skin);
  x.fillRect(cx - r * 0.32, cy + r * 0.6, r * 0.64, r * 0.8);
  x.beginPath();
  x.ellipse(cx, cy, r * 0.92, r * 1.06, 0, 0, TAU);
  x.fill();

  // hair
  x.fillStyle = hex(P.hair);
  const style = spec.hair;
  const spikes = (n, len, spread) => {
    x.beginPath();
    x.moveTo(cx - r, cy - r * 0.1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = Math.PI * (1 - t);
      const bx = cx + Math.cos(a) * r * 1.02;
      const by = cy + Math.sin(a) * -r * 1.02;
      const l = len * (0.6 + Math.sin(t * Math.PI) * 0.7);
      x.lineTo(bx + Math.cos(a) * l * spread, by - Math.sin(a) * l * 0.2 - l);
      x.lineTo(bx + Math.cos(a - 0.18) * r * 0.2, by + r * 0.05);
    }
    x.lineTo(cx + r, cy - r * 0.1);
    x.closePath(); x.fill();
  };
  if (style === 'spiky') spikes(7, r * 0.75, 0.5);
  else if (style === 'flame') spikes(9, r * 1.25, 0.35);
  else if (style === 'crest') {
    x.beginPath();
    x.ellipse(cx, cy - r * 0.5, r * 0.95, r * 0.6, 0, Math.PI, TAU);
    x.fill();
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.moveTo(cx - r * 0.1, cy - r * 0.9 + i * r * 0.18);
      x.lineTo(cx - r * 1.0, cy - r * 0.5 + i * r * 0.3);
      x.lineTo(cx - r * 0.1, cy - r * 0.6 + i * r * 0.22);
      x.closePath(); x.fill();
    }
  } else if (style === 'long' || style === 'ponytail') {
    x.beginPath();
    x.ellipse(cx, cy - r * 0.15, r * 1.12, r * 1.22, 0, Math.PI * 0.92, TAU * 1.04);
    x.fill();
    x.fillRect(cx - r * 1.1, cy - r * 0.3, r * 0.42, r * (style === 'long' ? 2.1 : 1.1));
    x.fillRect(cx + r * 0.68, cy - r * 0.3, r * 0.42, r * (style === 'long' ? 2.1 : 1.1));
  } else if (style === 'horns') {
    x.fillStyle = hex(P.accent);
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(cx + s * r * 0.55, cy - r * 0.7);
      x.lineTo(cx + s * r * 1.15, cy - r * 1.75);
      x.lineTo(cx + s * r * 0.95, cy - r * 0.55);
      x.closePath(); x.fill();
    }
    x.fillStyle = hex(P.hair);
    x.beginPath(); x.ellipse(cx, cy - r * 0.45, r * 0.9, r * 0.5, 0, Math.PI, TAU); x.fill();
  }

  // eyes
  const ec = spec.face?.eyeColor ?? '#2a3550';
  for (const s of [-1, 1]) {
    x.fillStyle = '#f7fbff';
    x.beginPath(); x.ellipse(cx + s * r * 0.36, cy + r * 0.06, r * 0.22, r * 0.16, 0, 0, TAU); x.fill();
    x.fillStyle = ec;
    x.beginPath(); x.ellipse(cx + s * r * 0.38, cy + r * 0.06, r * 0.11, r * 0.13, 0, 0, TAU); x.fill();
    x.strokeStyle = spec.face?.browColor ?? '#1a1410';
    x.lineWidth = r * 0.1; x.lineCap = 'round';
    x.beginPath();
    x.moveTo(cx + s * r * 0.15, cy - r * 0.24 + Math.abs(s) * 0);
    x.lineTo(cx + s * r * 0.6, cy - r * 0.34 + (spec.face?.angry ?? 0.3) * r * 0.5 * -s * s);
    x.stroke();
  }

  // bottom fade
  const fg = x.createLinearGradient(0, h * 0.7, 0, h);
  fg.addColorStop(0, 'transparent');
  fg.addColorStop(1, 'rgba(0,0,0,.85)');
  x.fillStyle = fg; x.fillRect(0, h * 0.7, w, h * 0.3);
  return c;
}

/* ---------------- stage thumbnail ---------------- */

export function stageCard(id, w = 320, h = 180) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const [sky, mid, ground] = stagePreviewColors(id);

  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, mid); g.addColorStop(0.62, sky);
  x.fillStyle = g; x.fillRect(0, 0, w, h);

  if (id === 'void' || id === 'city') {
    x.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 60; i++) {
      x.globalAlpha = rand(0.2, 1);
      x.fillRect(rand(0, w), rand(0, h * 0.7), 1.4, 1.4);
    }
    x.globalAlpha = 1;
  } else {
    const sg = x.createRadialGradient(w * 0.72, h * 0.3, 2, w * 0.72, h * 0.3, w * 0.3);
    sg.addColorStop(0, 'rgba(255,255,240,.95)');
    sg.addColorStop(1, 'transparent');
    x.fillStyle = sg; x.fillRect(0, 0, w, h);
  }

  // silhouettes
  x.fillStyle = ground;
  if (id === 'city') {
    for (let i = 0; i < 16; i++) {
      const bw = rand(12, 34), bh = rand(30, 110);
      x.fillRect(i * (w / 14) - 10, h - bh - h * 0.18, bw, bh);
    }
  } else if (id === 'arena') {
    x.beginPath();
    x.ellipse(w / 2, h * 1.02, w * 0.62, h * 0.34, 0, Math.PI, TAU);
    x.fill();
  } else if (id === 'void') {
    x.beginPath();
    x.moveTo(w * 0.18, h * 0.86); x.lineTo(w * 0.82, h * 0.86);
    x.lineTo(w * 0.7, h * 1.02); x.lineTo(w * 0.3, h * 1.02);
    x.closePath(); x.fill();
  } else {
    for (let i = 0; i < 7; i++) {
      const bx = i * (w / 6) + rand(-20, 20);
      const bh = rand(h * 0.18, h * 0.46);
      x.beginPath();
      x.moveTo(bx - 40, h * 0.86);
      x.lineTo(bx, h * 0.86 - bh);
      x.lineTo(bx + 44, h * 0.86);
      x.closePath(); x.fill();
    }
  }
  x.fillStyle = ground;
  x.fillRect(0, h * 0.84, w, h * 0.16);
  if (id === 'volcano') {
    x.fillStyle = 'rgba(255,120,30,.85)';
    x.fillRect(0, h * 0.88, w, 5);
    for (let i = 0; i < 5; i++) {
      x.beginPath();
      x.ellipse(rand(0, w), h * 0.93, rand(14, 40), 5, 0, 0, TAU);
      x.fill();
    }
  }

  const vg = x.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h);
  vg.addColorStop(0, 'transparent'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  x.fillStyle = vg; x.fillRect(0, 0, w, h);
  return c;
}

/* ---------------- screens ---------------- */

export class Menus {
  constructor(parent, audio) {
    this.parent = parent;
    this.audio = audio;
    this.screens = {};
    this.onAction = () => {};
    this.build();
  }

  screen(id) {
    const s = el('div', 'screen off hidden');
    s.id = id;
    this.parent.appendChild(s);
    this.screens[id] = s;
    return s;
  }

  show(id) {
    for (const k in this.screens) {
      const s = this.screens[k];
      const on = k === id;
      s.classList.toggle('hidden', !on);
      s.classList.toggle('off', !on);
      requestAnimationFrame(() => s.classList.toggle('on', on));
    }
    this.current = id;
  }

  hideAll() {
    for (const k in this.screens) {
      this.screens[k].classList.add('hidden', 'off');
      this.screens[k].classList.remove('on');
    }
    this.current = null;
  }

  build() {
    this.buildTitle();
    this.buildMode();
    this.buildSelect();
    this.buildStageSelect();
    this.buildControls();
    this.buildPause();
    this.buildResults();
  }

  /* ---- title ---- */
  buildTitle() {
    const s = this.screen('title-screen');
    const logo = el('div', 'logo');
    logo.innerHTML = `
      <div class="l1">SPARKING</div>
      <div class="l2">ARENA</div>
      <div class="l3">ULTIMATE BUDOKAI — 3D ANIME FIGHTER</div>`;
    const press = el('div', 'press-start', 'APPUYEZ SUR ENTRÉE');
    s.append(logo, press, el('div', 'vignette'));
    s.addEventListener('click', () => this.onAction('title-confirm'));
  }

  /* ---- mode ---- */
  buildMode() {
    const s = this.screen('mode-screen');
    s.append(el('div', 'screen-title', 'MODE DE COMBAT'));
    const list = el('div', 'menu-list');
    this.modeItems = [
      { id: 'vs-cpu', label: 'COMBAT SIMPLE', sub: 'Joueur contre CPU' },
      { id: 'vs-local', label: 'VERSUS LOCAL', sub: 'Écran partagé — 2 joueurs' },
      { id: 'survival', label: 'SURVIE', sub: 'Enchaînez les adversaires' },
      { id: 'controls', label: 'COMMANDES', sub: 'Voir la disposition des touches' },
    ];
    this.modeEls = this.modeItems.map((m, i) => {
      const e = el('div', 'menu-item' + (i === 0 ? ' sel' : ''),
        `${m.label}<span class="sub">${m.sub}</span>`);
      e.addEventListener('click', () => { this.modeIndex = i; this.syncMode(); this.onAction('mode-confirm'); });
      e.addEventListener('mouseenter', () => { this.modeIndex = i; this.syncMode(); });
      list.appendChild(e);
      return e;
    });
    this.modeIndex = 0;
    s.append(list, el('div', 'hint', '↑ ↓ NAVIGUER   •   ENTRÉE / J VALIDER   •   ÉCHAP RETOUR'));
  }

  syncMode() {
    this.modeEls.forEach((e, i) => e.classList.toggle('sel', i === this.modeIndex));
  }

  /* ---- character select ---- */
  buildSelect() {
    const s = this.screen('select-screen');
    this.selTitle = el('div', 'screen-title', 'JOUEUR 1 — CHOISISSEZ VOTRE COMBATTANT');
    this.selSub = el('div', 'screen-sub', '');
    const grid = el('div', 'roster');
    this.slotEls = ROSTER.map((spec, i) => {
      const slot = el('div', 'slot');
      const por = el('div', 'por');
      por.appendChild(portrait(spec, 260, 292));
      const nm = el('div', 'nm', spec.name);
      slot.append(por, nm);
      slot.addEventListener('click', () => this.onAction('select-pick', i));
      slot.addEventListener('mouseenter', () => this.onAction('select-hover', i));
      grid.appendChild(slot);
      return slot;
    });

    const detail = el('div', 'detail');
    const info = el('div', 'info');
    this.dName = el('div', 'dname', '');
    this.dTag = el('div', 'dtag', '');
    this.dBio = el('div', 'dbio', '');
    info.append(this.dName, this.dTag, this.dBio);

    const stats = el('div', 'stats');
    this.statEls = {};
    for (const [k, label] of [['hp', 'VIE'], ['atk', 'ATQ'], ['def', 'DÉF'], ['speed', 'VIT'], ['ki', 'KI']]) {
      const row = el('div', 'stat');
      const lb = el('div', 'lb', label);
      const tr = el('div', 'tr');
      const vl = el('div', 'vl');
      tr.appendChild(vl);
      row.append(lb, tr);
      stats.appendChild(row);
      this.statEls[k] = vl;
    }

    const moves = el('div', 'moves');
    this.moveRows = [];
    for (const k of ['blast1', 'blast2', 'ult', 'transform']) {
      const row = el('div', 'mrow');
      const mk = el('div', 'mk', '');
      const mv = el('div', 'mv', '');
      row.append(mk, mv);
      moves.appendChild(row);
      this.moveRows.push({ mk, mv });
    }

    detail.append(info, stats, moves);
    s.append(this.selTitle, this.selSub, grid, detail,
      el('div', 'hint', 'CLIC / FLÈCHES POUR CHOISIR   •   ENTRÉE VALIDER   •   ÉCHAP RETOUR'));
  }

  updateSelect(specIndex, phase, p1Pick) {
    const spec = ROSTER[specIndex];
    this.dName.textContent = spec.name;
    this.dTag.textContent = spec.tag;
    this.dBio.textContent = spec.bio;
    const acc = hex(spec.palette.aura);
    this.screens['select-screen'].style.setProperty('--acc', acc);
    for (const k in this.statEls) {
      this.statEls[k].style.transform = `scaleX(${spec.stats[k] / 10})`;
    }
    const rows = [
      ['BLAST 1', spec.moves.blast1.name],
      ['BLAST 2', spec.moves.blast2.name],
      ['ULTIME', spec.moves.ult.name],
      ['ÉVEIL', spec.transform.name],
    ];
    this.moveRows.forEach((r, i) => { r.mk.textContent = rows[i][0]; r.mv.textContent = rows[i][1]; });

    this.selTitle.textContent = phase === 0
      ? 'JOUEUR 1 — CHOISISSEZ VOTRE COMBATTANT'
      : (phase === 1 ? 'JOUEUR 2 — CHOISISSEZ VOTRE COMBATTANT' : 'ADVERSAIRE');
    this.selSub.textContent = spec.tag;

    this.slotEls.forEach((sl, i) => {
      sl.classList.toggle('p1', p1Pick === i && phase > 0);
      sl.classList.toggle('p2', phase > 0 && i === specIndex);
      sl.classList.toggle('locked', i === specIndex);
      if (i === specIndex && phase === 0) sl.classList.add('p1');
      if (phase === 0) sl.classList.toggle('p1', i === specIndex);
    });
  }

  /* ---- stage select ---- */
  buildStageSelect() {
    const s = this.screen('stage-screen');
    s.append(el('div', 'screen-title', 'CHOISISSEZ L\'ARÈNE'));
    const grid = el('div', 'stages');
    this.stageEls = STAGES.map((st, i) => {
      const card = el('div', 'stage-card');
      card.appendChild(stageCard(st.id, 420, 236));
      card.appendChild(el('div', 'sn', st.name));
      card.addEventListener('click', () => this.onAction('stage-pick', i));
      card.addEventListener('mouseenter', () => this.onAction('stage-hover', i));
      grid.appendChild(card);
      return card;
    });
    s.append(grid);

    const diff = el('div', 'menu-list');
    diff.style.marginTop = '2vh';
    this.diffEl = el('div', 'menu-item sel', '');
    this.diffEl.addEventListener('click', () => this.onAction('diff-cycle'));
    diff.appendChild(this.diffEl);
    s.append(diff, el('div', 'hint', 'ENTRÉE POUR COMBATTRE   •   ÉCHAP RETOUR'));
  }

  updateStage(index, diffIndex, showDiff = true) {
    this.stageEls.forEach((e, i) => e.classList.toggle('sel', i === index));
    this.diffEl.style.display = showDiff ? '' : 'none';
    const d = DIFFICULTIES[diffIndex];
    this.diffEl.innerHTML =
      `DIFFICULTÉ : ${d.name}<span class="sub">${d.sub} — CLIQUEZ / ← → POUR CHANGER</span>`;
  }

  /* ---- controls ---- */
  buildControls() {
    const s = this.screen('controls-screen');
    s.append(el('div', 'screen-title', 'COMMANDES'));
    const grid = el('div', 'controls-grid');
    const rows = [
      ['W A S D', 'Déplacement (verrouillé sur l\'adversaire)'],
      ['E / Q', 'Monter / descendre (vol)'],
      ['MAJ', 'Boost — Dragon Dash'],
      ['CLIC G. / J', 'Attaque enchaînée (spammez pour le combo)'],
      ['CLIC D. / L', 'Boule de ki'],
      ['CLIC MIL. / K', 'Coup lourd (↑ = uppercut, ↓ = écrasement)'],
      ['M', 'Caméra à la souris (curseur masqué)'],
      ['ESPACE', 'Garde'],
      ['MAJ (en dégât)', 'Téléportation — contre'],
      ['C', 'Charge de ki'],
      ['C + ESPACE', 'SPARKING ! — transformation'],
      ['U', 'Blast 1 — compétence'],
      ['I', 'Blast 2 — super'],
      ['O', 'ULTIME (en Sparking)'],
      ['ÉCHAP', 'Pause / relâcher la souris'],
      ['Joueur 2', 'Flèches + pavé numérique 0-6'],
      ['Manettes', 'Deux manettes détectées automatiquement'],
    ];
    for (const [k, a] of rows) {
      const r = el('div', 'crow');
      r.append(el('div', 'key', k), el('div', 'act', a));
      grid.appendChild(r);
    }
    s.append(grid, el('div', 'hint', 'ÉCHAP / ENTRÉE POUR REVENIR'));
  }

  /* ---- pause ---- */
  buildPause() {
    const s = this.screen('pause-screen');
    s.appendChild(el('div', 'dim'));
    const panel = el('div', 'panel');
    panel.appendChild(el('div', 'screen-title', 'PAUSE'));
    const list = el('div', 'menu-list');
    this.pauseItems = [
      { id: 'resume', label: 'REPRENDRE', sub: '' },
      { id: 'rematch', label: 'RECOMMENCER', sub: 'Relancer le combat' },
      { id: 'quit', label: 'QUITTER', sub: 'Retour au menu principal' },
    ];
    this.pauseEls = this.pauseItems.map((m, i) => {
      const e = el('div', 'menu-item' + (i === 0 ? ' sel' : ''), `${m.label}<span class="sub">${m.sub}</span>`);
      e.addEventListener('click', () => { this.pauseIndex = i; this.syncPause(); this.onAction('pause-confirm'); });
      e.addEventListener('mouseenter', () => { this.pauseIndex = i; this.syncPause(); });
      list.appendChild(e);
      return e;
    });
    this.pauseIndex = 0;
    panel.appendChild(list);
    s.appendChild(panel);
  }
  syncPause() { this.pauseEls.forEach((e, i) => e.classList.toggle('sel', i === this.pauseIndex)); }

  /* ---- results ---- */
  buildResults() {
    const s = this.screen('result-screen');
    s.appendChild(el('div', 'dim'));
    const panel = el('div', 'panel');
    this.resTitle = el('div', 'result-title win', 'VICTOIRE');
    this.resWho = el('div', 'screen-sub', '');
    const stats = el('div', 'result-stats');
    this.resStats = {};
    for (const [k, label] of [['dealt', 'DÉGÂTS'], ['combo', 'MAX COMBO'], ['blasts', 'BLASTS'], ['time', 'TEMPS']]) {
      const b = el('div', 'rstat');
      const v = el('div', 'v', '0');
      b.append(v, el('div', 'k', label));
      stats.appendChild(b);
      this.resStats[k] = v;
    }
    const list = el('div', 'menu-list');
    this.resultItems = [
      { id: 'rematch', label: 'REVANCHE', sub: '' },
      { id: 'chars', label: 'CHANGER DE COMBATTANT', sub: '' },
      { id: 'quit', label: 'MENU PRINCIPAL', sub: '' },
    ];
    this.resultEls = this.resultItems.map((m, i) => {
      const e = el('div', 'menu-item' + (i === 0 ? ' sel' : ''), `${m.label}<span class="sub">${m.sub}</span>`);
      e.addEventListener('click', () => { this.resultIndex = i; this.syncResult(); this.onAction('result-confirm'); });
      e.addEventListener('mouseenter', () => { this.resultIndex = i; this.syncResult(); });
      list.appendChild(e);
      return e;
    });
    this.resultIndex = 0;
    panel.append(this.resTitle, this.resWho, stats, list);
    s.appendChild(panel);
  }
  syncResult() { this.resultEls.forEach((e, i) => e.classList.toggle('sel', i === this.resultIndex)); }

  showResult(win, winnerName, stats) {
    this.resTitle.textContent = win ? 'VICTOIRE' : 'DÉFAITE';
    this.resTitle.className = 'result-title ' + (win ? 'win' : 'lose');
    this.resWho.textContent = `${winnerName} REMPORTE LE COMBAT`;
    this.resStats.dealt.textContent = Math.round(stats.dealt);
    this.resStats.combo.textContent = stats.maxCombo;
    this.resStats.blasts.textContent = stats.blasts;
    this.resStats.time.textContent = `${Math.floor(stats.time)}s`;
    this.resultIndex = 0; this.syncResult();
    this.show('result-screen');
  }
}
