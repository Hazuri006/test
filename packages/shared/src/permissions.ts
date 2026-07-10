/**
 * Clés de permissions du panel. La vérification est TOUJOURS effectuée côté
 * backend — ces constantes ne servent au frontend que pour afficher/masquer
 * des éléments d'interface.
 */
export const PERMISSIONS = {
  TICKETS_CREATE: 'tickets.create',
  TICKETS_VIEW_OWN: 'tickets.view_own',
  TICKETS_VIEW_ALL: 'tickets.view_all',
  TICKETS_CLAIM: 'tickets.claim',
  TICKETS_CLOSE: 'tickets.close',
  TICKETS_DELETE: 'tickets.delete',
  MESSAGES_SEND: 'messages.send',
  MESSAGES_MODERATE: 'messages.moderate',
  ANNOUNCEMENTS_CREATE: 'announcements.create',
  ANNOUNCEMENTS_MANAGE: 'announcements.manage',
  USERS_MODERATE: 'users.moderate',
  ROLES_MANAGE: 'roles.manage',
  REPORTS_VIEW: 'reports.view',
  AUDIT_VIEW: 'audit.view',
  SETTINGS_MANAGE: 'settings.manage',
  ADMIN_ACCESS: 'admin.access',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  'tickets.create': 'Créer des tickets',
  'tickets.view_own': 'Voir ses propres tickets',
  'tickets.view_all': 'Voir tous les tickets',
  'tickets.claim': 'Prendre en charge un ticket',
  'tickets.close': 'Fermer / rouvrir un ticket',
  'tickets.delete': 'Supprimer ou archiver un ticket',
  'messages.send': 'Envoyer des messages privés',
  'messages.moderate': 'Modérer les messages',
  'announcements.create': 'Créer des annonces',
  'announcements.manage': 'Gérer toutes les annonces',
  'users.moderate': 'Modérer les utilisateurs',
  'roles.manage': 'Gérer les rôles',
  'reports.view': 'Consulter les signalements',
  'audit.view': "Consulter les journaux d'audit",
  'settings.manage': 'Gérer les paramètres du panel',
  'admin.access': "Accéder à l'espace administrateur",
};

/** Noms des rôles locaux (du moins prioritaire au plus prioritaire). */
export const ROLE_NAMES = ['MEMBER', 'SUPPORT', 'MODERATOR', 'ADMIN', 'OWNER'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE_PRIORITIES: Record<RoleName, number> = {
  MEMBER: 10,
  SUPPORT: 20,
  MODERATOR: 30,
  ADMIN: 40,
  OWNER: 50,
};

const MEMBER_PERMS: PermissionKey[] = [
  PERMISSIONS.TICKETS_CREATE,
  PERMISSIONS.TICKETS_VIEW_OWN,
  PERMISSIONS.MESSAGES_SEND,
];

const SUPPORT_PERMS: PermissionKey[] = [
  ...MEMBER_PERMS,
  PERMISSIONS.TICKETS_VIEW_ALL,
  PERMISSIONS.TICKETS_CLAIM,
  PERMISSIONS.TICKETS_CLOSE,
];

const MODERATOR_PERMS: PermissionKey[] = [
  ...SUPPORT_PERMS,
  PERMISSIONS.MESSAGES_MODERATE,
  PERMISSIONS.USERS_MODERATE,
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.ANNOUNCEMENTS_CREATE,
];

const ADMIN_PERMS: PermissionKey[] = [
  ...MODERATOR_PERMS,
  PERMISSIONS.TICKETS_DELETE,
  PERMISSIONS.ANNOUNCEMENTS_MANAGE,
  PERMISSIONS.ROLES_MANAGE,
  PERMISSIONS.AUDIT_VIEW,
  PERMISSIONS.ADMIN_ACCESS,
];

const OWNER_PERMS: PermissionKey[] = [...ADMIN_PERMS, PERMISSIONS.SETTINGS_MANAGE];

/** Permissions par défaut de chaque rôle (utilisé par le seed, modifiable en base). */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, PermissionKey[]> = {
  MEMBER: MEMBER_PERMS,
  SUPPORT: SUPPORT_PERMS,
  MODERATOR: MODERATOR_PERMS,
  ADMIN: ADMIN_PERMS,
  OWNER: OWNER_PERMS,
};
