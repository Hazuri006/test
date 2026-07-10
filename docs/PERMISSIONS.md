# Système de rôles et permissions (RBAC)

## Principe

Les autorisations sont portées par des **permissions** individuelles (`tickets.close`, `users.moderate`…), pas par les noms de rôles. Un rôle est un simple ensemble de permissions stocké en base (`Role` ⇄ `RolePermission` ⇄ `Permission`), un utilisateur peut porter plusieurs rôles (`UserRole`).

**Toutes les vérifications se font côté backend** : chaque endpoint sensible déclare `@RequirePermissions(...)`, contrôlé par un guard global après authentification. Le frontend ne fait que masquer des boutons.

## Rôles système

| Rôle | Priorité | Permissions ajoutées |
| --- | --- | --- |
| `MEMBER` | 10 | `tickets.create`, `tickets.view_own`, `messages.send` |
| `SUPPORT` | 20 | + `tickets.view_all`, `tickets.claim`, `tickets.close` |
| `MODERATOR` | 30 | + `messages.moderate`, `users.moderate`, `reports.view`, `announcements.create` |
| `ADMIN` | 40 | + `tickets.delete`, `announcements.manage`, `roles.manage`, `audit.view`, `admin.access` |
| `OWNER` | 50 | + `settings.manage` |

Ces ensembles par défaut sont définis dans `packages/shared/src/permissions.ts` et appliqués par le seed ; ils sont ensuite modifiables en base sans toucher au code.

## Liste des permissions

| Clé | Description |
| --- | --- |
| `tickets.create` | Créer des tickets |
| `tickets.view_own` | Voir ses propres tickets |
| `tickets.view_all` | Voir tous les tickets (staff) |
| `tickets.claim` | Prendre en charge / réassigner / modifier un ticket |
| `tickets.close` | Fermer, résoudre, rouvrir |
| `tickets.delete` | Archiver / supprimer (soft delete) |
| `messages.send` | Envoyer des messages privés |
| `messages.moderate` | Supprimer les messages d'autrui |
| `announcements.create` | Créer et publier des annonces |
| `announcements.manage` | Modifier/supprimer toutes les annonces |
| `users.moderate` | Avertir, suspendre, bannir |
| `roles.manage` | Modifier les rôles des membres |
| `reports.view` | Traiter les signalements |
| `audit.view` | Consulter les journaux d'audit |
| `settings.manage` | Paramètres du panel |
| `admin.access` | Accéder à l'espace `/admin` |

## Règles de hiérarchie

- Impossible d'agir (sanction, changement de rôle) sur un membre de **priorité supérieure ou égale** à la sienne.
- Impossible d'attribuer un rôle supérieur ou égal au sien.
- Chaque action administrative exige un **motif** et est écrite dans `AuditLog` (acteur, action, cible, motif, IP).
- Le cache des permissions (Redis, 60 s) est invalidé à chaque changement de rôle.

## Ajouter une permission

1. Ajoutez la clé dans `PERMISSIONS` et sa description (`packages/shared/src/permissions.ts`), et aux rôles voulus dans `DEFAULT_ROLE_PERMISSIONS`.
2. `npm run seed` (upsert, idempotent).
3. Protégez vos endpoints : `@RequirePermissions(PERMISSIONS.MA_PERMISSION)`.
4. Côté frontend, masquez l'interface avec `can(PERMISSIONS.MA_PERMISSION)`.
