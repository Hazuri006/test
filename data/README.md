# Data Resources

THE LAST WARD uses a **code‑first data layer with optional `.tres` overrides**.

The single source of truth for items, quests, documents and audio logs is built in
code so the game can never break from a missing or malformed data file:

| Content      | Code database                                   | Override folder        |
|--------------|-------------------------------------------------|------------------------|
| Items        | `scripts/inventory/item_database.gd`            | `data/items/`          |
| Quests       | `scripts/quests/quest_database.gd`              | `data/quests/`         |
| Documents    | `scripts/data/document_database.gd`             | `data/documents/`      |
| Audio logs   | `scripts/data/audio_log_database.gd`            | `data/audio_logs/`     |
| Monster tune | `data/monster/hollow_attendant.tres`            | (loaded directly)      |
| Difficulty   | `data/difficulty/{story,normal,hard,nightmare}.tres` | (loaded directly) |

## Overriding with `.tres`

Drop a `.tres` resource of the matching custom type into the override folder. If its
`id` matches a built‑in entry, it replaces it; otherwise it is added. Example — to
re‑balance an item, create an `ItemData` resource with `id = "flashlight_battery"`
and save it as `data/items/flashlight_battery.tres`.

The custom Resource types are:
`ItemData`, `QuestData`, `QuestStepData`, `DocumentData`, `AudioLogData`,
`MonsterConfig`, `DifficultyConfig` (see `scripts/data/`).

`MonsterConfig` and the four `DifficultyConfig` presets are shipped as real `.tres`
files so you can tune the monster and difficulty without touching code.
