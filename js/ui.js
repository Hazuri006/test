/* ============================================================
 * UI — Menus, HUD, inventaire, notes, viseur (DOM overlay)
 * ============================================================ */

const UI = {
  el: {},

  cache() {
    const ids = [
      "screen-start", "screen-gameover", "screen-victory",
      "hud", "hp-fill", "hp-text", "stam-fill", "ammo-text", "herb-text",
      "objective", "score-text", "notes-text", "keys-row",
      "toasts", "note-modal", "note-title", "note-body", "note-close",
      "inv-modal", "inv-grid", "inv-close", "pause-modal",
      "go-score", "vi-score", "vi-time", "damage-vignette",
      "start-btn", "restart-btn", "restart-btn2",
      "crosshair", "boss-bar", "boss-fill", "lock-overlay", "interact",
    ];
    ids.forEach(id => this.el[id] = document.getElementById(id));
  },

  showScreen(name) {
    ["screen-start", "screen-gameover", "screen-victory"].forEach(s => this.el[s].classList.add("hidden"));
    if (name) this.el[name].classList.remove("hidden");
  },

  setHudVisible(v) {
    this.el.hud.classList.toggle("hidden", !v);
    this.el.crosshair.classList.toggle("hidden", !v);
  },

  updateHUD(game) {
    const p = game.player;
    const pct = Math.max(0, p.hp / p.maxHp);
    this.el["hp-fill"].style.width = (pct * 100) + "%";
    this.el["hp-fill"].style.background = pct > 0.5 ? "#3fae5a" : pct > 0.25 ? "#d8a93a" : "#c83a3a";
    this.el["hp-text"].textContent = Math.ceil(p.hp) + " / " + p.maxHp;
    this.el["stam-fill"].style.width = (p.stamina / CONFIG.STAMINA_MAX * 100) + "%";
    this.el["ammo-text"].textContent = p.ammo;
    this.el["herb-text"].textContent = p.inv.herb;
    this.el["score-text"].textContent = game.score;
    this.el["notes-text"].textContent = p.inv.note + " / " + Quests.sideNotesTotal;

    const obj = Quests.current();
    this.el["objective"].textContent = obj ? "▶ " + obj.text : "—";

    const keyIcons = { rustyKey: "🗝️", labKey: "🔑", cure: "🧪" };
    let html = "";
    p.keys.forEach(k => { if (keyIcons[k]) html += `<span title="${ITEM_TYPES[k].name}">${keyIcons[k]}</span>`; });
    this.el["keys-row"].innerHTML = html;
  },

  updateBoss(game) {
    const boss = game.monsters.find(m => m.type === "boss" && !m.dead);
    if (boss && Math.hypot(boss.x - game.player.x, boss.z - game.player.z) < 50) {
      this.el["boss-bar"].classList.remove("hidden");
      this.el["boss-fill"].style.width = Math.max(0, boss.hp / boss.maxHp * 100) + "%";
    } else {
      this.el["boss-bar"].classList.add("hidden");
    }
  },

  setInteract(text) {
    if (text) { this.el["interact"].textContent = text; this.el["interact"].classList.remove("hidden"); }
    else this.el["interact"].classList.add("hidden");
  },

  showLockOverlay(show) { this.el["lock-overlay"].classList.toggle("hidden", !show); },

  toast(msg) {
    const d = document.createElement("div");
    d.className = "toast"; d.textContent = msg;
    this.el["toasts"].appendChild(d);
    requestAnimationFrame(() => d.classList.add("show"));
    setTimeout(() => { d.classList.remove("show"); setTimeout(() => d.remove(), 400); }, 2800);
  },

  showNote(note) {
    this.el["note-title"].textContent = note.title;
    this.el["note-body"].textContent = note.body;
    this.el["note-modal"].classList.remove("hidden");
  },
  hideNote() { this.el["note-modal"].classList.add("hidden"); },

  openInventory(game) {
    const p = game.player, grid = this.el["inv-grid"];
    grid.innerHTML = "";
    const entries = [
      { icon: "🔫", name: "Munitions", qty: p.ammo, desc: ITEM_TYPES.ammo.desc },
      { icon: "🌿", name: "Herbe verte", qty: p.inv.herb, desc: ITEM_TYPES.herb.desc },
    ];
    if (p.inv.note > 0) entries.push({ icon: "📜", name: "Documents", qty: p.inv.note, desc: "Indices et bribes d'histoire." });
    p.keys.forEach(k => entries.push({ icon: { rustyKey: "🗝️", labKey: "🔑", cure: "🧪" }[k], name: ITEM_TYPES[k].name, qty: 1, desc: ITEM_TYPES[k].desc }));
    entries.forEach(e => {
      const c = document.createElement("div");
      c.className = "inv-cell";
      c.innerHTML = `<div class="inv-icon">${e.icon}</div>
        <div class="inv-name">${e.name}${e.qty > 1 ? " ×" + e.qty : ""}</div>
        <div class="inv-desc">${e.desc}</div>`;
      grid.appendChild(c);
    });
    this.el["inv-modal"].classList.remove("hidden");
  },

  damagePulse() {
    const v = this.el["damage-vignette"];
    v.classList.remove("pulse"); void v.offsetWidth; v.classList.add("pulse");
  },

  showGameOver(game) { this.el["go-score"].textContent = game.score; this.showScreen("screen-gameover"); },
  showVictory(game) {
    this.el["vi-score"].textContent = game.score;
    this.el["vi-time"].textContent = game.formatTime();
    this.showScreen("screen-victory");
  },
};
