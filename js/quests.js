/* ============================================================
 * QUÊTES — Objectifs principaux & secondaire
 * ============================================================ */

const Quests = {
  list: [],
  sideNotesTotal: 5,

  reset() {
    this.list = [
      { id: "explore",      text: "Explorer le château et trouver une issue.", done: true,  hidden: false },
      { id: "find_rusty",   text: "Trouver la Clé rouillée (Salle à Manger).",  done: false, hidden: false },
      { id: "open_library", text: "Déverrouiller la Bibliothèque.",             done: false, hidden: false },
      { id: "find_labkey",  text: "Récupérer la Clé du Laboratoire (Cachots).", done: false, hidden: true  },
      { id: "open_lab",     text: "Pénétrer dans le Laboratoire.",              done: false, hidden: true  },
      { id: "kill_boss",    text: "Détruire Le Gardien.",                       done: false, hidden: true  },
      { id: "get_cure",     text: "Récupérer le Sérum-G.",                      done: false, hidden: true  },
      { id: "escape",       text: "Ouvrir la Grande Porte et s'échapper !",     done: false, hidden: true  },
    ];
  },

  get(id) { return this.list.find(q => q.id === id); },

  reveal(id) { const q = this.get(id); if (q) q.hidden = false; },

  complete(id, game) {
    const q = this.get(id);
    if (!q || q.done) return;
    q.done = true;
    q.hidden = false;
    game.toast("✔ Objectif accompli : " + q.text);
  },

  // Objectif courant (premier non terminé et visible)
  current() {
    return this.list.find(q => !q.done && !q.hidden) ||
           this.list.find(q => !q.done) || null;
  },

  notesFound(game) {
    return game.player ? game.player.inv.note : 0;
  },

  // --- Réactions aux événements ---
  onItemPicked(type, game) {
    if (type === "rustyKey") {
      this.complete("find_rusty", game);
      this.reveal("open_library");
    } else if (type === "labKey") {
      this.complete("find_labkey", game);
      this.reveal("open_lab");
    } else if (type === "cure") {
      this.complete("get_cure", game);
      this.reveal("escape");
      game.toast("La Grande Porte peut désormais être ouverte !");
    }
  },

  onDoorOpened(door, game) {
    if (door.name === "Bibliothèque") {
      this.complete("open_library", game);
      this.reveal("find_labkey");
      game.toast("Nouvel objectif : la Clé du Laboratoire est dans les Cachots.");
    } else if (door.name === "Laboratoire" && door.locked === false && door.key === "labKey") {
      this.complete("open_lab", game);
      this.reveal("kill_boss");
      game.toast("Le Gardien rôde ici... Préparez-vous.");
    } else if (door.isExit) {
      this.complete("escape", game);
      game.onVictory();
    }
  },

  onMonsterKilled(m, game) {
    if (m.type === "boss") {
      this.complete("kill_boss", game);
      this.reveal("get_cure");
      game.toast("Le Gardien est tombé. Récupérez le Sérum-G !");
    }
  },
};
