# Connexion Discord (OAuth2)

## Créer l'application

1. https://discord.com/developers/applications → **New Application**, nommez-la (ex. « Yurei Panel »).
2. **OAuth2 → General** : copiez le **Client ID** ; **Reset Secret** pour obtenir le **Client Secret**.
3. **OAuth2 → Redirects** : ajoutez l'URL de callback **exacte** :
   - dev : `http://localhost:4000/api/auth/discord/callback`
   - prod : `https://api.votre-domaine.com/api/auth/discord/callback`

Renseignez ensuite `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` et `DISCORD_REDIRECT_URI` dans `.env`.

## Déroulement du flux

```
Navigateur                      API (NestJS)                       Discord
    │  GET /api/auth/discord        │                                 │
    │──────────────────────────────▶│ state aléatoire → Redis (10min) │
    │        302 authorize URL      │────────────────────────────────▶│
    │  …l'utilisateur accepte…      │                                 │
    │  GET /callback?code&state     │  state validé (usage unique)    │
    │──────────────────────────────▶│  POST /oauth2/token (secret)    │
    │                               │────────────────────────────────▶│
    │                               │  GET /users/@me (access token)  │
    │                               │  upsert User + DiscordAccount   │
    │   Set-Cookie yurei_session    │  session en base (hash SHA-256) │
    │◀──────────────────────────────│                                 │
    │        302 /dashboard         │                                 │
```

Points de sécurité :

- **`state`** aléatoire (24 octets), stocké dans Redis, à usage unique — anti-CSRF.
- Le **Client Secret** n'est utilisé que côté backend ; le navigateur ne voit jamais les tokens Discord.
- Les tokens Discord sont chiffrés (AES-256-GCM) avant stockage.
- Scope minimal : `identify` (+ `email` uniquement si `DISCORD_REQUEST_EMAIL=true`).
- Cookie de session : HTTP-only, `SameSite=Lax`, `Secure` en production, expiration 7 jours (configurable), renouvellement glissant, révocation réelle au logout.
- Échec Discord → redirection vers `/login?error=…` avec message traduit.

## Données récupérées

Identifiant Discord, nom d'utilisateur, nom d'affichage, avatar, bannière (si disponible), e-mail (optionnel). À chaque connexion, pseudo/avatar sont resynchronisés et `lastLoginAt` mis à jour. L'identifiant Discord est la clé externe unique : jamais de compte en double.

## Synchronisation des rôles (facultative)

La connexion fonctionne **sans bot**. Pour mapper des rôles Discord vers des rôles locaux :

1. Créez un bot sur la même application (**Bot → Add Bot**), copiez son token → `DISCORD_BOT_TOKEN`.
2. Invitez-le sur votre serveur avec la permission de lire les membres, renseignez `DISCORD_GUILD_ID`.
3. `DISCORD_ROLE_SYNC_ENABLED=true` (désactivable aussi depuis Administration → Paramètres).
4. Éditez `apps/api/discord-role-map.json` :

```json
{
  "mappings": [
    { "discordRoleId": "123456789012345678", "localRole": "MODERATOR" }
  ]
}
```

Comportement : vérification **exclusivement côté backend** via l'API bot (`GET /guilds/{id}/members/{userId}`), cache Redis 10 min, gestion des erreurs 404/429, jamais de rétrogradation d'un `OWNER`, jamais d'attribution d'`OWNER` via Discord. Un échec de synchronisation ne bloque jamais la connexion.

## Webhook tickets (facultatif)

`DISCORD_TICKET_WEBHOOK_URL` : si renseigné, un résumé de chaque nouveau ticket (numéro, catégorie, priorité — **sans contenu sensible**) est publié dans le salon Discord correspondant.
