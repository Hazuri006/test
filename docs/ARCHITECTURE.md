# Architecture

## Vue d'ensemble

```
┌────────────┐   HTTPS (REST, cookies)   ┌────────────┐      ┌────────────┐
│  Next.js   │ ─────────────────────────▶│  NestJS    │─────▶│ PostgreSQL │
│  (web)     │   WebSocket /ws           │  (api)     │      └────────────┘
│            │ ◀─────────────────────────│            │─────▶┌────────────┐
└────────────┘                           └────────────┘      │   Redis    │
                                              │              └────────────┘
                                              ▼
                                      Discord API (OAuth2, bot facultatif)
```

- **`apps/web`** — Next.js App Router. Uniquement de l'affichage et des appels API : aucune décision de sécurité n'y est prise. Les vérifications de permissions côté client (`can(...)`) ne servent qu'à masquer des éléments d'interface.
- **`apps/api`** — NestJS. Toute la logique métier, la validation (Zod), les autorisations (guards globaux), le temps réel (Socket.IO) et l'audit.
- **`packages/shared`** — constantes de permissions, schémas Zod et types DTO partagés entre les deux applications (compilé en CommonJS).

## Backend — modules

| Module | Rôle |
| --- | --- |
| `auth` | Flux OAuth2 Discord, création/mise à jour du compte, `/auth/me`, logout |
| `session` | Sessions opaques : token aléatoire → SHA-256 en base, cookie HTTP-only, renouvellement glissant |
| `rbac` | Rôles + permissions en base, union mise en cache Redis (60 s) |
| `realtime` | Gateway Socket.IO (`/ws`), `RealtimeService` (émissions), `PresenceService` (présence Redis) |
| `users` | Profils publics, préférences, recherche, agrégat `/dashboard` |
| `friends` | Demandes, blocages, amis en commun — clé `pairKey` anti-doublon |
| `messages` | DM (clé `dmKey` anti-doublon), réactions, réponses, lectures, recherche, signalement |
| `uploads` | Validation stricte des fichiers, noms aléatoires, tokens d'attache à usage unique, stockage local/S3 |
| `tickets` | Cycle de vie complet, notes internes staff, transcriptions, statistiques |
| `notifications` | Création + push temps réel, préférences par type |
| `announcements` | Annonces riches (HTML assaini), publication programmée, épinglage |
| `server-status` | Interface `GameServerAdapter` + implémentations `demo` et `http` |
| `admin` | Gestion utilisateurs, sanctions, signalements, audit, paramètres |
| `audit` | Journal des opérations sensibles (jamais de token/secret) |
| `discord-sync` | Synchronisation facultative des rôles Discord via bot |

### Guards globaux (dans l'ordre)

1. `ThrottlerGuard` — rate limiting par IP (300 req/min, plus strict sur l'auth et l'envoi).
2. `OriginGuard` — anti-CSRF : les mutations exigent un en-tête `Origin`/`Referer` autorisé.
3. `SessionAuthGuard` — authentification par cookie de session (routes `@Public()` exemptées) ; les comptes suspendus sont limités à la lecture.
4. `PermissionsGuard` — permissions déclarées par `@RequirePermissions(...)`.

## Adaptateur serveur de jeu

`GameServerAdapter` (`apps/api/src/server-status/adapters/adapter.interface.ts`) expose `fetchStatus()`. Deux implémentations sont fournies :

- **`demo`** — données fictives de développement, signalées `demo: true` (bandeau visible sur le dashboard) ;
- **`http`** — interroge `GAME_SERVER_STATUS_URL` (JSON) avec timeout de 5 s.

Pour brancher un vrai serveur (WebSocket, base de données, webhook, Nanos World…), implémentez l'interface, enregistrez le provider dans `server-status.module.ts` et sélectionnez-le via `GAME_SERVER_ADAPTER`.

## Multi-instances

L'API est sans état : sessions en base + Redis, présence dans Redis, Socket.IO derrière `@socket.io/redis-adapter`. Les tâches périodiques (instantanés serveur) prennent un verrou Redis (`SET NX`) pour n'être exécutées que par une instance.

## Frontend

- `hooks/use-session` — session courante (React Query) + `can(permission)`.
- `hooks/use-socket` — connexion Socket.IO, heartbeat (25 s, détection d'inactivité), liste « En ligne », compteur de notifications, invalidations React Query sur événements.
- `lib/i18n` — dictionnaires `fr`/`en` typés, préférence persistée (cookie + profil).
- `middleware.ts` — redirections UX uniquement (présence du cookie) ; l'autorité reste l'API.
