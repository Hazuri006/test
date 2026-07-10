# 👻 Yurei Project — Panel communautaire

Panel web communautaire moderne pour serveur de jeu : connexion Discord, présence en temps réel, amis, messagerie privée, tickets, annonces, notifications et administration complète.

> « Yurei Project » est un nom temporaire : changez-le via `APP_NAME` / `NEXT_PUBLIC_APP_NAME` dans `.env`, sans toucher au code.

## Stack

| Couche | Technologies |
| --- | --- |
| Frontend | Next.js 15 (App Router), TypeScript strict, Tailwind CSS 4, Radix UI, Framer Motion, React Hook Form + Zod, React Query, Socket.IO client, i18n fr/en |
| Backend | NestJS 11, REST + Socket.IO, Prisma ORM, Zod, sanitize-html, Helmet |
| Données | PostgreSQL 16, Redis 7 (présence, cache, rate limiting, adapter Socket.IO multi-instances) |
| Infra | Docker Compose, migrations Prisma, seed de démonstration, stockage local ou S3 |

Documentation détaillée : [Architecture](docs/ARCHITECTURE.md) · [OAuth Discord](docs/DISCORD_OAUTH.md) · [Permissions](docs/PERMISSIONS.md) · [WebSockets](docs/WEBSOCKETS.md) · [Pages](docs/PAGES.md)

---

## Démarrage rapide (tout-en-un avec Docker)

```bash
cp .env.example .env
# Renseignez au minimum : SESSION_SECRET, APP_ENCRYPTION_KEY,
# DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET (voir § 3)
docker compose up --build
```

→ Frontend sur http://localhost:3000, API sur http://localhost:4000.
Au premier lancement, exécutez le seed : `docker compose exec api npx prisma db seed`.

---

## Installation détaillée (développement)

### 1. Node.js et dépendances

- Installez **Node.js ≥ 20** (https://nodejs.org, ou `nvm install 22`).
- Clonez le dépôt puis :

```bash
npm run setup        # npm install + build du package partagé + prisma generate
```

### 2. PostgreSQL et Redis

Le plus simple en développement :

```bash
npm run dev:services   # docker compose -f docker-compose.dev.yml up -d
```

Cela démarre PostgreSQL (port 5432, base `yurei`, utilisateur/mot de passe `yurei`) et Redis (port 6379). Sans Docker, installez-les manuellement et adaptez `DATABASE_URL` / `REDIS_URL` dans `.env`.

### 3. Créer l'application Discord

1. Ouvrez https://discord.com/developers/applications → **New Application**.
2. Dans **OAuth2 → General**, copiez le **Client ID** et générez un **Client Secret**.
3. Dans **OAuth2 → Redirects**, ajoutez exactement :
   `http://localhost:4000/api/auth/discord/callback`

Guide complet (production, scopes, bot facultatif) : [docs/DISCORD_OAUTH.md](docs/DISCORD_OAUTH.md).

### 4. Où placer le Client ID et le Client Secret

```bash
cp .env.example .env
```

Puis dans `.env` (à la racine — les deux applications le lisent) :

```env
DISCORD_CLIENT_ID=votre_client_id
DISCORD_CLIENT_SECRET=votre_client_secret   # backend uniquement, jamais exposé au navigateur
SESSION_SECRET=<openssl rand -hex 32>
APP_ENCRYPTION_KEY=<openssl rand -hex 32>
```

### 5. Configurer l'URL de redirection

`DISCORD_REDIRECT_URI` doit correspondre **exactement** à l'URL déclarée sur le portail Discord :

- développement : `http://localhost:4000/api/auth/discord/callback`
- production : `https://api.votre-domaine.com/api/auth/discord/callback` (à ajouter aussi dans le portail Discord)

### 6. Lancer les migrations

```bash
npm run prisma:migrate     # développement (crée/applique les migrations)
npm run prisma:deploy      # production (applique les migrations existantes)
```

### 7. Lancer le seed

```bash
npm run seed
```

Crée les rôles/permissions (toujours) et, **hors production**, les comptes de démonstration : un propriétaire, un admin, un modérateur, un support, plusieurs membres, des amitiés, conversations, tickets, annonces, notifications et un historique serveur fictif.

### 8. Démarrer le projet

```bash
npm run dev
```

- Frontend : http://localhost:3000
- API : http://localhost:4000 (healthcheck : `/api/health`)

Autres commandes : `npm run build` (build complet), `npm start` (production locale), `npm run lint`, `npm run typecheck`, `npm test` (unitaires API), `npm run test:e2e` (Playwright).

### 9. Créer le premier propriétaire

1. Connectez-vous une première fois via Discord (votre compte est créé avec le rôle `MEMBER`).
2. Promouvez-vous `OWNER` directement en base :

```bash
docker compose -f docker-compose.dev.yml exec postgres psql -U yurei -d yurei -c "
  INSERT INTO \"UserRole\" (\"userId\", \"roleId\")
  SELECT u.id, r.id FROM \"User\" u, \"Role\" r
  WHERE u.\"discordId\" = 'VOTRE_ID_DISCORD' AND r.name = 'OWNER'
  ON CONFLICT DO NOTHING;"
```

(Remplacez `VOTRE_ID_DISCORD` par votre identifiant Discord — activez le mode développeur dans Discord puis clic droit sur votre profil → *Copier l'identifiant*.) Les promotions suivantes se font depuis le panel : **Administration → Utilisateurs**.

### 10. Déployer le panel

1. Serveur avec Docker + un domaine (idéalement `panel.domaine.com` et `api.domaine.com`).
2. `.env` de production : `NODE_ENV=production`, URLs publiques (`WEB_URL`, `API_URL`, `NEXT_PUBLIC_API_URL`), secrets **régénérés**, `DISCORD_REDIRECT_URI` en HTTPS (et déclaré côté Discord), `STORAGE_DRIVER=s3` + variables `S3_*` recommandés, `SEED_DEMO=false`.
3. `docker compose up --build -d` — l'API applique automatiquement les migrations au démarrage.
4. Placez un reverse proxy TLS (Caddy, Nginx, Traefik) devant les ports 3000/4000. Les cookies de session passent `Secure` automatiquement en production.
5. Premier propriétaire : voir § 9.
6. Pour scaler l'API sur plusieurs instances : rien à faire, la présence et Socket.IO passent déjà par Redis.

---

## Comptes de démonstration

Après le seed en développement : `Kaito` (OWNER), `Akane` (ADMIN), `Ren` (MODERATOR), `Hana` (SUPPORT), `Sora`, `Yuki`, `Kenji`, `Mio` (MEMBER). Ces comptes ont des identifiants Discord fictifs : ils ne peuvent pas se connecter (aucun mot de passe n'existe), ils servent à peupler l'interface (liste d'amis, tickets, messages…) que vous voyez depuis votre vrai compte.

## Arborescence

```
├── apps
│   ├── api          # NestJS : auth, RBAC, présence, amis, messages, tickets…
│   └── web          # Next.js : pages, composants UI, i18n
├── packages
│   └── shared       # Permissions, schémas Zod, types partagés
├── docs             # Documentation
├── docker-compose.yml       # Stack complète
└── docker-compose.dev.yml   # PostgreSQL + Redis seulement
```

## Ce que le panel ne fait volontairement PAS

- Il ne lit **jamais** vos messages privés Discord, votre liste d'amis Discord ni votre statut Discord.
- La liste « En ligne » reflète la **présence sur le panel** (WebSocket + heartbeat), pas Discord.
- Les amis et les messages vivent dans la base de données du panel.
- L'état du serveur de jeu est fourni par un **adaptateur de démonstration** clairement signalé tant qu'aucun vrai serveur n'est branché (`GAME_SERVER_ADAPTER=http` + `GAME_SERVER_STATUS_URL`).
