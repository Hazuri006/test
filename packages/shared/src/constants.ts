export const TICKET_CATEGORIES = [
  'TECH_SUPPORT',
  'ACCOUNT',
  'PLAYER_REPORT',
  'SHOP',
  'APPLICATION',
  'BUG',
  'OTHER',
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_STATUSES = [
  'OPEN',
  'WAITING_USER',
  'WAITING_STAFF',
  'CLAIMED',
  'RESOLVED',
  'CLOSED',
  'ARCHIVED',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const PRESENCE_STATUSES = ['ONLINE', 'AWAY', 'OFFLINE'] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'WELCOME',
  'FRIEND_REQUEST',
  'FRIEND_ACCEPTED',
  'NEW_MESSAGE',
  'TICKET_REPLY',
  'TICKET_CLAIMED',
  'TICKET_STATUS',
  'ANNOUNCEMENT',
  'MODERATION',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const REPORT_STATUSES = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const MODERATION_TYPES = ['WARN', 'SUSPEND', 'TEMP_BAN', 'BAN', 'UNBAN', 'NOTE'] as const;
export type ModerationType = (typeof MODERATION_TYPES)[number];

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Extensions de fichiers autorisées pour les pièces jointes. */
export const ALLOWED_FILE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'pdf',
  'txt',
  'log',
  'zip',
] as const;

export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
] as const;

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_BIO_LENGTH = 500;
export const MAX_CUSTOM_STATUS_LENGTH = 100;

export const ticketNumberLabel = (n: number): string => `TICKET-${String(n).padStart(6, '0')}`;
