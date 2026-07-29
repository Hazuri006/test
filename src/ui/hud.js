/* ============================================================
   HUD — health / ki gauges, combo popups, announcements,
   beam-struggle meter.
   ============================================================ */
import { clamp, damp } from '../core/utils.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class HUD {
  constructor(parent) {
    this.root = el('div', 'layer hidden');
    this.root.id = 'hud';
    parent.appendChild(this.root);

    this.sides = [];
    for (const side of ['left', 'right']) {
      const s = el('div', `side ${side}`);
      const stack = el('div', 'stack');
      const nameRow = el('div', 'name-row');
      const name = el('div', 'fighter-name', '—');
      const tag = el('div', 'fighter-tag', '');
      nameRow.append(name, tag);

      const bar = el('div', 'bar-shell');
      const lag = el('div', 'bar-lag');
      const fill = el('div', 'bar-fill');
      const gloss = el('div', 'gloss');
      bar.append(lag, fill, gloss);

      const ki = el('div', 'ki-shell');
      const kiFill = el('div', 'ki-fill');
      ki.append(kiFill);

      const meta = el('div', 'meta-row');
      const pips = el('div', 'pips');
      const pipEls = [];
      for (let i = 0; i < 5; i++) { const p = el('div', 'pip'); pips.appendChild(p); pipEls.push(p); }
      const spark = el('div', 'sparking-tag', 'SPARKING!');
      meta.append(pips, spark);

      stack.append(nameRow, bar, ki, meta);
      s.appendChild(stack);
      this.root.appendChild(s);
      this.sides.push({ s, name, tag, bar, lag, fill, ki, kiFill, pipEls, spark, lagVal: 1, hpVal: 1 });
    }

    const top = el('div', 'center-top');
    this.timer = el('div', 'timer', '60');
    this.rounds = el('div', 'rounds');
    this.roundSets = [];
    for (let i = 0; i < 2; i++) {
      const set = el('div', 'round-set');
      this.rounds.appendChild(set);
      this.roundSets.push(set);
    }
    top.append(this.timer, this.rounds);
    this.root.appendChild(top);

    this.combos = [];
    for (const c of ['p1', 'p2']) {
      const box = el('div', `combo ${c}`);
      const n = el('div', 'n', '0');
      const l = el('div', 'l', 'HITS');
      box.append(n, l);
      this.root.appendChild(box);
      this.combos.push({ box, n });
    }

    this.announceBox = el('div', 'announce');
    this.announceTxt = el('div', 'txt', '');
    this.announceBox.appendChild(this.announceTxt);
    this.root.appendChild(this.announceBox);

    this.struggle = el('div', 'struggle-shell');
    this.struggleFill = el('div', 'struggle-fill');
    this.struggleDiv = el('div', 'divider');
    this.struggle.append(this.struggleFill, this.struggleDiv);
    this.root.appendChild(this.struggle);

    this.mash = el('div', 'mash-prompt');
    this.mash.innerHTML = '<div class="k">J / □</div><div class="t">MARTELEZ !</div>';
    this.root.appendChild(this.mash);

    this.mouseBadge = el('div', 'mouse-badge',
      '<b>SOURIS</b> CAMÉRA ACTIVE — <b>M</b> POUR RELÂCHER');
    this.root.appendChild(this.mouseBadge);

    this.moveBanner = el('div', 'announce');
    this.moveTxt = el('div', 'txt', '');
    this.moveTxt.style.fontSize = 'clamp(22px, 5vh, 76px)';
    this.moveBanner.appendChild(this.moveTxt);
    this.moveBanner.style.alignItems = 'flex-end';
    this.moveBanner.style.paddingBottom = '18vh';
    this.root.appendChild(this.moveBanner);
  }

  show(v = true) { this.root.classList.toggle('hidden', !v); this.root.classList.toggle('on', v); }

  setMouseLook(on) { this.mouseBadge.classList.toggle('on', !!on); }

  setFighters(a, b) {
    const cols = ['var(--p1)', 'var(--p2)'];
    const deep = ['var(--p1-deep)', 'var(--p2-deep)'];
    [a, b].forEach((f, i) => {
      const s = this.sides[i];
      s.name.textContent = f.spec.name;
      s.tag.textContent = f.spec.tag;
      s.fill.style.setProperty('--c', cols[i]);
      s.fill.style.setProperty('--c-deep', deep[i]);
      s.hpVal = 1; s.lagVal = 1;
    });
    this.fighters = [a, b];
  }

  setRounds(wins, needed) {
    this.roundSets.forEach((set, i) => {
      set.innerHTML = '';
      for (let k = 0; k < needed; k++) {
        const l = el('div', 'lamp' + (k < wins[i] ? ' won' : ''));
        set.appendChild(l);
      }
    });
  }

  setTimer(sec) {
    const s = Math.max(0, Math.ceil(sec));
    this.timer.textContent = String(s);
    this.timer.classList.toggle('low', s <= 10);
  }

  update(dt) {
    if (!this.fighters) return;
    this.fighters.forEach((f, i) => {
      const s = this.sides[i];
      const hp = clamp(f.hp / f.maxHp, 0, 1);
      s.hpVal = damp(s.hpVal, hp, 22, dt);
      s.lagVal = s.lagVal > hp ? damp(s.lagVal, hp, 3.2, dt) : hp;
      s.fill.style.transform = `scaleX(${s.hpVal})`;
      s.lag.style.transform = `scaleX(${s.lagVal})`;
      const ki = clamp(f.ki / f.maxKi, 0, 1);
      s.kiFill.style.transform = `scaleX(${ki})`;
      s.ki.classList.toggle('max', ki > 0.985);
      const pips = Math.floor(f.skill);
      s.pipEls.forEach((p, k) => p.classList.toggle('on', k < pips));
      s.spark.classList.toggle('on', f.sparking);
    });
  }

  showCombo(index, n) {
    if (n < 2) return;
    const c = this.combos[index];
    c.n.textContent = String(n);
    c.box.classList.remove('show');
    void c.box.offsetWidth;
    c.box.classList.add('show');
  }
  hideCombo(index) { this.combos[index]?.box.classList.remove('show'); }

  announce(text, cb) {
    this.announceTxt.textContent = text;
    this.announceBox.classList.remove('show');
    void this.announceBox.offsetWidth;
    this.announceBox.classList.add('show');
    if (cb) setTimeout(cb, 1400);
  }

  announceMove(index, name, big = false) {
    this.moveTxt.textContent = name;
    this.moveTxt.style.color = index === 0 ? '#bfeaff' : '#ffd0c0';
    this.moveTxt.style.fontSize = big ? 'clamp(26px, 6.4vh, 96px)' : 'clamp(18px, 4vh, 60px)';
    this.moveBanner.classList.remove('show');
    void this.moveBanner.offsetWidth;
    this.moveBanner.classList.add('show');
  }

  showStruggle(v) {
    this.struggle.classList.toggle('on', v);
    this.mash.classList.toggle('on', v);
  }
  setStruggle(balance) {
    // balance: -1 (p2 winning) .. 1 (p1 winning)
    const k = clamp((balance + 1) / 2, 0, 1);
    this.struggleDiv.style.left = `${k * 100}%`;
    this.struggleFill.style.transform = `scaleX(1)`;
    this.struggleFill.style.filter = `hue-rotate(${(k - 0.5) * 30}deg)`;
  }
}
