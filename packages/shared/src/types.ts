import type { PermissionKey, RoleName } from './permissions';
import type {
  NotificationType,
  PresenceStatus,
  ReportStatus,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from './constants';

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: RoleName;
  customStatus?: string | null;
}

export interface SessionUser extends UserSummary {
  discordId: string;
  bannerUrl: string | null;
  bio: string | null;
  locale: string;
  createdAt: string;
  lastLoginAt: string | null;
  permissions: PermissionKey[];
  preferences: UserPreferencesDTO;
}

export interface UserPreferencesDTO {
  locale: string;
  theme: string;
  notifyFriendRequests: boolean;
  notifyMessages: boolean;
  notifyTickets: boolean;
  notifyAnnouncements: boolean;
  showActivity: boolean;
  showLastSeen: boolean;
  allowFriendRequests: boolean;
  allowDms: boolean;
  reducedMotion: boolean;
}

export interface PublicProfile extends UserSummary {
  bannerUrl: string | null;
  bio: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  badges: string[];
  presence: PresenceStatus;
  friendCount: number;
  mutualFriends: UserSummary[];
  friendshipStatus: 'NONE' | 'FRIENDS' | 'PENDING_SENT' | 'PENDING_RECEIVED' | 'BLOCKED' | 'SELF';
  stats: { tickets: number; messages: number };
}

export interface PresenceEntry {
  user: UserSummary;
  status: PresenceStatus;
  activity: string | null;
  lastActiveAt: string;
}

export interface FriendEntry {
  user: UserSummary;
  since: string;
  presence: PresenceStatus;
}

export interface FriendRequestEntry {
  id: string;
  user: UserSummary;
  createdAt: string;
  direction: 'INCOMING' | 'OUTGOING';
}

export interface ConversationDTO {
  id: string;
  other: UserSummary;
  lastMessage: { content: string; authorId: string; createdAt: string; hasAttachment: boolean } | null;
  unreadCount: number;
  muted: boolean;
  lastMessageAt: string | null;
}

export interface AttachmentDTO {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  author: UserSummary;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyTo: { id: string; content: string; authorName: string } | null;
  attachments: AttachmentDTO[];
  reactions: { emoji: string; count: number; mine: boolean }[];
}

export interface TicketListItem {
  id: string;
  number: number;
  code: string;
  title: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  creator: UserSummary;
  assignee: UserSummary | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface TicketDetail extends TicketListItem {
  participants: UserSummary[];
  closedAt: string | null;
  messages: TicketMessageDTO[];
  internalNotes?: TicketInternalNoteDTO[];
}

export interface TicketMessageDTO {
  id: string;
  author: UserSummary;
  content: string;
  createdAt: string;
  attachments: AttachmentDTO[];
  system: boolean;
}

export interface TicketInternalNoteDTO {
  id: string;
  author: UserSummary;
  content: string;
  createdAt: string;
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AnnouncementDTO {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content?: string;
  imageUrl: string | null;
  category: string;
  tags: string[];
  pinned: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  author: UserSummary;
  publishedAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
}

export interface GameServerStatus {
  online: boolean;
  playerCount: number;
  maxPlayers: number;
  mapName: string;
  uptimeSeconds: number;
  version: string;
  latencyMs: number;
  maintenance: boolean;
  players?: { name: string; playTimeMinutes: number }[];
  source: 'demo' | 'http';
  demo: boolean;
  recordedAt: string;
}

export interface ServerStatusHistoryPoint {
  recordedAt: string;
  playerCount: number;
  online: boolean;
}

export interface DashboardData {
  friendCount: number;
  pendingFriendRequests: number;
  unreadMessages: number;
  openTickets: number;
  onlineCount: number;
  unreadNotifications: number;
  recentAnnouncements: AnnouncementDTO[];
  recentActivity: { type: string; label: string; at: string; link: string | null }[];
  serverStatus: GameServerStatus;
  serverHistory: ServerStatusHistoryPoint[];
}

export interface ReportDTO {
  id: string;
  reporter: UserSummary;
  targetUser: UserSummary | null;
  messageId: string | null;
  reason: string;
  details: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: UserSummary | null;
}

export interface AuditLogDTO {
  id: string;
  actor: UserSummary | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ModerationActionDTO {
  id: string;
  type: string;
  reason: string;
  moderator: UserSummary;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface UploadResult {
  token: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
}

// Événements Socket.IO (serveur -> client)
export type ServerEvent =
  | 'presence.update'
  | 'presence.list'
  | 'notification.new'
  | 'notification.count'
  | 'friend.update'
  | 'message.new'
  | 'message.updated'
  | 'message.deleted'
  | 'message.reaction'
  | 'conversation.read'
  | 'typing'
  | 'ticket.updated'
  | 'ticket.message'
  | 'announcement.new';
