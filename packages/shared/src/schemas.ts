import { z } from 'zod';
import {
  LOCALES,
  MAX_BIO_LENGTH,
  MAX_CUSTOM_STATUS_LENGTH,
  MAX_MESSAGE_LENGTH,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from './constants';

export const idSchema = z.string().min(1).max(64);

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

// ---------------------------------------------------------------------------
// Profil / préférences
// ---------------------------------------------------------------------------
export const updateProfileSchema = z.object({
  bio: z.string().max(MAX_BIO_LENGTH).optional(),
  customStatus: z.string().max(MAX_CUSTOM_STATUS_LENGTH).optional(),
});

export const updatePreferencesSchema = z.object({
  locale: z.enum(LOCALES).optional(),
  theme: z.enum(['dark', 'system']).optional(),
  notifyFriendRequests: z.boolean().optional(),
  notifyMessages: z.boolean().optional(),
  notifyTickets: z.boolean().optional(),
  notifyAnnouncements: z.boolean().optional(),
  showActivity: z.boolean().optional(),
  showLastSeen: z.boolean().optional(),
  allowFriendRequests: z.boolean().optional(),
  allowDms: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Amis
// ---------------------------------------------------------------------------
export const friendTargetSchema = z.object({ userId: idSchema });

// ---------------------------------------------------------------------------
// Messagerie
// ---------------------------------------------------------------------------
export const attachmentTokenSchema = z.string().min(10).max(128);

export const sendMessageSchema = z
  .object({
    content: z.string().trim().max(MAX_MESSAGE_LENGTH).default(''),
    replyToId: idSchema.optional(),
    attachments: z.array(attachmentTokenSchema).max(5).default([]),
  })
  .refine((d) => d.content.length > 0 || d.attachments.length > 0, {
    message: 'Message vide',
    path: ['content'],
  });

export const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

export const createConversationSchema = z.object({ userId: idSchema });

export const searchMessagesSchema = z.object({
  q: z.string().trim().min(2).max(100),
});

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------
export const createTicketSchema = z.object({
  title: z.string().trim().min(4).max(120),
  category: z.enum(TICKET_CATEGORIES),
  description: z.string().trim().min(10).max(5000),
  priority: z.enum(TICKET_PRIORITIES).default('MEDIUM'),
  subjectUserId: idSchema.optional(),
  attachments: z.array(attachmentTokenSchema).max(5).default([]),
});

export const ticketMessageSchema = z
  .object({
    content: z.string().trim().max(5000).default(''),
    attachments: z.array(attachmentTokenSchema).max(5).default([]),
  })
  .refine((d) => d.content.length > 0 || d.attachments.length > 0, {
    message: 'Message vide',
    path: ['content'],
  });

export const ticketInternalNoteSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

export const updateTicketSchema = z.object({
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  assigneeId: idSchema.nullable().optional(),
});

export const ticketFilterSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  creatorId: idSchema.optional(),
  assigneeId: idSchema.optional(),
  unassigned: z.coerce.boolean().optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ---------------------------------------------------------------------------
// Annonces
// ---------------------------------------------------------------------------
export const announcementSchema = z.object({
  title: z.string().trim().min(4).max(150),
  summary: z.string().trim().min(4).max(300),
  content: z.string().trim().min(10).max(50000),
  imageUrl: z.string().url().max(500).optional().or(z.literal('')),
  category: z.string().trim().min(2).max(50),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  pinned: z.boolean().default(false),
  scheduledFor: z.coerce.date().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Signalements
// ---------------------------------------------------------------------------
export const createReportSchema = z
  .object({
    targetUserId: idSchema.optional(),
    messageId: idSchema.optional(),
    reason: z.string().trim().min(3).max(100),
    details: z.string().trim().max(2000).default(''),
  })
  .refine((d) => d.targetUserId || d.messageId, { message: 'Cible requise', path: ['targetUserId'] });

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------
export const moderationActionSchema = z.object({
  type: z.enum(['WARN', 'SUSPEND', 'TEMP_BAN', 'BAN', 'NOTE']),
  reason: z.string().trim().min(3).max(500),
  durationHours: z.coerce.number().int().min(1).max(24 * 365).optional(),
});

export const revokeSanctionSchema = z.object({
  actionId: idSchema,
  reason: z.string().trim().min(3).max(500),
});

export const setRoleSchema = z.object({
  roleName: z.enum(['MEMBER', 'SUPPORT', 'MODERATOR', 'ADMIN', 'OWNER']),
  reason: z.string().trim().min(3).max(500),
});

export const updateSettingsSchema = z.object({
  appName: z.string().trim().min(2).max(60).optional(),
  maintenanceMode: z.boolean().optional(),
  roleSyncEnabled: z.boolean().optional(),
});

export const resolveReportSchema = z.object({
  status: z.enum(['REVIEWING', 'RESOLVED', 'DISMISSED']),
  note: z.string().trim().max(1000).optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type AnnouncementInput = z.infer<typeof announcementSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
