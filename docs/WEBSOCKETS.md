# Temps réel (Socket.IO)

## Connexion

- Endpoint : `ws(s)://API_URL` avec `path: '/ws'`.
- Authentification : le **cookie de session** est validé à la connexion (même mécanisme que le REST). Socket refusée sinon.
- Chaque socket rejoint la room `user:{id}` — les services backend émettent vers ces rooms.
- Multi-instances : `@socket.io/redis-adapter` relaie les émissions entre instances.

## Présence

La présence reflète l'activité **sur le panel** (jamais le statut Discord) :

- le client émet `heartbeat` toutes les 25 s avec `{ idle, activity }` (`idle` = pas d'interaction depuis 3 min ou onglet masqué) ;
- Redis conserve `presence:online` (set), `presence:data:{userId}` (statut, activité, dernière activité) et une clé heartbeat expirante ;
- `AWAY` après `PRESENCE_AWAY_AFTER_MS` sans activité (défaut 5 min), `OFFLINE` si le heartbeat expire (`PRESENCE_OFFLINE_AFTER_MS`, défaut 2 min — un sweep serveur tourne toutes les 30 s) ;
- à la déconnexion du dernier socket : `OFFLINE` + mise à jour de `lastSeenAt` en base.

## Événements client → serveur

| Événement | Payload | Description |
| --- | --- | --- |
| `heartbeat` | `{ idle: boolean, activity?: string }` | Maintien de présence |
| `typing` | `{ conversationId, isTyping }` | Indicateur de saisie (membres de la conversation uniquement — vérifié serveur) |

## Événements serveur → client

| Événement | Destinataires | Payload |
| --- | --- | --- |
| `presence.list` | socket connectant | liste complète `PresenceEntry[]` |
| `presence.update` | broadcast | `{ userId, status, activity, lastActiveAt }` |
| `notification.new` | user | `NotificationDTO` |
| `notification.count` | user | `{ count }` |
| `friend.update` | users concernés | signal de resynchronisation |
| `message.new` / `message.updated` / `message.reaction` | membres de la conversation | `MessageDTO` |
| `message.deleted` | membres | `{ messageId, conversationId }` |
| `conversation.read` | membres | `{ conversationId, userId, at }` |
| `typing` | autres membres | `{ conversationId, userId, displayName, isTyping }` |
| `ticket.updated` / `ticket.message` | créateur + assigné | `{ ticketId }` |
| `announcement.new` | broadcast | `AnnouncementDTO` |

## Côté frontend

`hooks/use-socket.tsx` centralise tout : connexion à l'ouverture de session, heartbeat + détection d'inactivité, mise à jour de la liste « En ligne », toasts sur notifications, invalidation des caches React Query par type d'événement. La page `messages/[id]` ajoute ses propres écouteurs pour le fil actif.
