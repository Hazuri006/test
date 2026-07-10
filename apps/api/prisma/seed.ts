/**
 * Seed de démonstration — Yurei Project.
 * Les comptes fictifs ne sont créés qu'en développement (ou si SEED_DEMO=true).
 * Les rôles et permissions sont TOUJOURS créés (nécessaires en production).
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
// .env racine du monorepo (DATABASE_URL…), puis .env local éventuel
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import { PrismaClient } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLE_NAMES,
  ROLE_PRIORITIES,
} from '@yurei/shared';

const prisma = new PrismaClient();

const DEMO_ENABLED = process.env.NODE_ENV !== 'production' || process.env.SEED_DEMO === 'true';

async function seedRbac(): Promise<void> {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description: PERMISSION_DESCRIPTIONS[key] },
      update: { description: PERMISSION_DESCRIPTIONS[key] },
    });
  }
  for (const name of ROLE_NAMES) {
    const role = await prisma.role.upsert({
      where: { name },
      create: { name, priority: ROLE_PRIORITIES[name], isSystem: true },
      update: { priority: ROLE_PRIORITIES[name] },
    });
    const permissions = await prisma.permission.findMany({
      where: { key: { in: DEFAULT_ROLE_PERMISSIONS[name] } },
    });
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }
  console.log('✔ Rôles et permissions');
}

interface DemoUser {
  discordId: string;
  username: string;
  displayName: string;
  role: (typeof ROLE_NAMES)[number];
  bio?: string;
  customStatus?: string;
  badges?: string[];
}

const demoUsers: DemoUser[] = [
  { discordId: '100000000000000001', username: 'yurei_owner', displayName: 'Kaito', role: 'OWNER', bio: 'Fondateur du Yurei Project.', customStatus: 'Toujours dans les nuages ⛩️', badges: ['founder'] },
  { discordId: '100000000000000002', username: 'akane_admin', displayName: 'Akane', role: 'ADMIN', bio: "Administratrice — je veille sur le panel.", badges: ['staff'] },
  { discordId: '100000000000000003', username: 'ren_mod', displayName: 'Ren', role: 'MODERATOR', bio: 'Modérateur. Fair-play avant tout.', badges: ['staff'] },
  { discordId: '100000000000000004', username: 'hana_support', displayName: 'Hana', role: 'SUPPORT', bio: 'Support technique, je réponds vite !', badges: ['staff'] },
  { discordId: '100000000000000005', username: 'sora_member', displayName: 'Sora', role: 'MEMBER', bio: 'RP enjoyer depuis 2021.', customStatus: 'En pleine partie 🎮' },
  { discordId: '100000000000000006', username: 'yuki_member', displayName: 'Yuki', role: 'MEMBER', bio: 'Nouvelle sur le serveur, soyez sympas !' },
  { discordId: '100000000000000007', username: 'kenji_member', displayName: 'Kenji', role: 'MEMBER' },
  { discordId: '100000000000000008', username: 'mio_member', displayName: 'Mio', role: 'MEMBER', customStatus: 'AFK ce soir' },
];

function demoAvatar(index: number): string {
  return `https://cdn.discordapp.com/embed/avatars/${index % 6}.png`;
}

async function seedUsers(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  let index = 0;
  for (const demo of demoUsers) {
    const user = await prisma.user.upsert({
      where: { discordId: demo.discordId },
      create: {
        discordId: demo.discordId,
        username: demo.username,
        displayName: demo.displayName,
        avatarUrl: demoAvatar(index),
        bio: demo.bio,
        customStatus: demo.customStatus,
        badges: demo.badges ?? [],
        lastLoginAt: new Date(Date.now() - index * 3600 * 1000),
        lastSeenAt: new Date(Date.now() - index * 1800 * 1000),
        preference: { create: {} },
        discordAccount: {
          create: { discordId: demo.discordId, username: demo.username, globalName: demo.displayName },
        },
      },
      update: { displayName: demo.displayName },
    });
    ids.set(demo.username, user.id);

    const role = await prisma.role.findUnique({ where: { name: demo.role } });
    if (role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id },
        update: {},
      });
    }
    index++;
  }
  console.log(`✔ ${demoUsers.length} utilisateurs de démonstration`);
  return ids;
}

async function seedFriendships(ids: Map<string, string>): Promise<void> {
  const pairs: [string, string, boolean][] = [
    ['yurei_owner', 'akane_admin', true],
    ['sora_member', 'yuki_member', true],
    ['sora_member', 'kenji_member', true],
    ['hana_support', 'sora_member', true],
    ['yuki_member', 'mio_member', false], // demande en attente
    ['kenji_member', 'akane_admin', false],
  ];
  for (const [a, b, accepted] of pairs) {
    const requesterId = ids.get(a)!;
    const addresseeId = ids.get(b)!;
    const pairKey = [requesterId, addresseeId].sort().join(':');
    await prisma.friendship.upsert({
      where: { pairKey },
      create: {
        requesterId,
        addresseeId,
        pairKey,
        status: accepted ? 'ACCEPTED' : 'PENDING',
        acceptedAt: accepted ? new Date() : null,
      },
      update: {},
    });
  }
  console.log('✔ Relations d’amitié');
}

async function seedConversations(ids: Map<string, string>): Promise<void> {
  const convos: [string, string, string[]][] = [
    ['sora_member', 'yuki_member', [
      'Salut ! Tu joues ce soir ?',
      'Oui, vers 21h après le taf 😄',
      'Parfait, on se retrouve au spawn',
    ]],
    ['hana_support', 'sora_member', [
      "J'ai vu ton ticket, je m'en occupe demain matin.",
      'Merci beaucoup Hana 🙏',
    ]],
    ['yurei_owner', 'akane_admin', [
      'La maj du panel part vendredi.',
      'Noté, je préviens le staff.',
    ]],
  ];
  for (const [a, b, messages] of convos) {
    const userA = ids.get(a)!;
    const userB = ids.get(b)!;
    const dmKey = [userA, userB].sort().join(':');
    const existing = await prisma.conversation.findUnique({ where: { dmKey } });
    if (existing) continue;
    const conversation = await prisma.conversation.create({
      data: { dmKey, members: { create: [{ userId: userA }, { userId: userB }] } },
    });
    let at = Date.now() - messages.length * 600000;
    for (let i = 0; i < messages.length; i++) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          authorId: i % 2 === 0 ? userA : userB,
          content: messages[i],
          createdAt: new Date(at),
        },
      });
      at += 600000;
    }
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(at - 600000) },
    });
  }
  console.log('✔ Conversations et messages');
}

async function seedTickets(ids: Map<string, string>): Promise<void> {
  const count = await prisma.ticket.count();
  if (count > 0) {
    console.log('✔ Tickets (déjà présents)');
    return;
  }
  const tickets = [
    {
      title: 'Impossible de rejoindre le serveur',
      category: 'TECH_SUPPORT' as const,
      priority: 'HIGH' as const,
      status: 'CLAIMED' as const,
      creator: 'sora_member',
      assignee: 'hana_support',
      messages: [
        ['sora_member', "Depuis la maj je reçois une erreur de connexion au lancement."],
        ['hana_support', 'Peux-tu vider ton cache et réessayer ? Je regarde les logs.'],
        ['sora_member', "C'est fait, toujours pareil."],
      ],
    },
    {
      title: 'Signalement : comportement anti-jeu',
      category: 'PLAYER_REPORT' as const,
      priority: 'MEDIUM' as const,
      status: 'WAITING_STAFF' as const,
      creator: 'yuki_member',
      assignee: null,
      messages: [['yuki_member', "Un joueur a cassé le RP hier soir vers 22h près du port."]],
    },
    {
      title: 'Candidature équipe de modération',
      category: 'APPLICATION' as const,
      priority: 'LOW' as const,
      status: 'RESOLVED' as const,
      creator: 'kenji_member',
      assignee: 'ren_mod',
      messages: [
        ['kenji_member', 'Je souhaite rejoindre la modération, 3 ans d’expérience.'],
        ['ren_mod', 'Merci ! Candidature retenue pour un entretien vocal.'],
      ],
    },
    {
      title: 'Problème de paiement boutique',
      category: 'SHOP' as const,
      priority: 'URGENT' as const,
      status: 'OPEN' as const,
      creator: 'mio_member',
      assignee: null,
      messages: [['mio_member', "J'ai été débitée deux fois pour le pack VIP."]],
    },
    {
      title: 'Bug : inventaire vide après reconnexion',
      category: 'BUG' as const,
      priority: 'HIGH' as const,
      status: 'CLOSED' as const,
      creator: 'sora_member',
      assignee: 'hana_support',
      messages: [
        ['sora_member', 'Mon inventaire disparaît après chaque reconnexion.'],
        ['hana_support', 'Corrigé avec le hotfix 1.4.1, merci du signalement !'],
      ],
    },
  ];

  for (const t of tickets) {
    const creatorId = ids.get(t.creator)!;
    const assigneeId = t.assignee ? ids.get(t.assignee)! : null;
    const closing = ['RESOLVED', 'CLOSED', 'ARCHIVED'].includes(t.status);
    const ticket = await prisma.ticket.create({
      data: {
        title: t.title,
        category: t.category,
        priority: t.priority,
        status: t.status,
        creatorId,
        assigneeId,
        closedAt: closing ? new Date() : null,
        lastMessageAt: new Date(),
        participants: { create: [{ userId: creatorId }] },
      },
    });
    let at = Date.now() - t.messages.length * 3600 * 1000;
    for (const [author, content] of t.messages) {
      await prisma.ticketMessage.create({
        data: { ticketId: ticket.id, authorId: ids.get(author)!, content, createdAt: new Date(at) },
      });
      at += 3600 * 1000;
    }
    if (assigneeId) {
      await prisma.ticketInternalNote.create({
        data: {
          ticketId: ticket.id,
          authorId: assigneeId,
          content: 'Note interne : à surveiller, dossier sensible.',
        },
      });
    }
  }
  console.log(`✔ ${tickets.length} tickets`);
}

async function seedAnnouncements(ids: Map<string, string>): Promise<void> {
  const announcements = [
    {
      slug: 'ouverture-saison-3',
      title: 'Ouverture de la saison 3 !',
      summary: 'La nouvelle saison arrive avec une carte inédite et un système économique repensé.',
      content:
        '<p>La <strong>saison 3</strong> du Yurei Project ouvre ses portes vendredi à 20h.</p><h3>Au programme</h3><ul><li>Nouvelle carte « Yurei City »</li><li>Économie rééquilibrée</li><li>Nouveaux métiers RP</li></ul><p>Rendez-vous sur le serveur !</p>',
      category: 'evenement',
      tags: ['saison', 'evenement'],
      pinned: true,
      author: 'yurei_owner',
    },
    {
      slug: 'maj-1-4-2-notes',
      title: 'Notes de mise à jour 1.4.2',
      summary: 'Corrections de bugs et améliorations de performances.',
      content:
        '<p>La version <code>1.4.2</code> est en ligne.</p><ul><li>Correction du bug d’inventaire</li><li>Latence réduite de 20%</li><li>Nouveau système anti-cheat</li></ul>',
      category: 'patch',
      tags: ['maj', 'bugfix'],
      pinned: false,
      author: 'akane_admin',
    },
    {
      slug: 'recrutement-staff',
      title: 'Le staff recrute !',
      summary: 'Nous cherchons des modérateurs et de l’aide pour le support.',
      content:
        '<p>Envie de rejoindre l’aventure ? Ouvre un ticket <em>Candidature</em> depuis le panel.</p>',
      category: 'communaute',
      tags: ['recrutement'],
      pinned: false,
      author: 'ren_mod',
    },
  ];
  for (const a of announcements) {
    await prisma.announcement.upsert({
      where: { slug: a.slug },
      create: {
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        content: a.content,
        category: a.category,
        tags: a.tags,
        pinned: a.pinned,
        status: 'PUBLISHED',
        publishedAt: new Date(Date.now() - Math.random() * 5 * 24 * 3600 * 1000),
        authorId: ids.get(a.author)!,
      },
      update: {},
    });
  }
  console.log('✔ Annonces');
}

async function seedNotifications(ids: Map<string, string>): Promise<void> {
  const soraId = ids.get('sora_member')!;
  const existing = await prisma.notification.count({ where: { userId: soraId } });
  if (existing > 0) return;
  await prisma.notification.createMany({
    data: [
      { userId: soraId, type: 'WELCOME', title: 'Bienvenue sur Yurei Project !', body: 'Ton compte a été créé.', link: '/profile' },
      { userId: soraId, type: 'TICKET_CLAIMED', title: 'TICKET-000001 pris en charge', body: "Hana s'occupe de ton ticket.", link: '/tickets' },
      { userId: soraId, type: 'FRIEND_ACCEPTED', title: "Demande d'ami acceptée", body: 'Yuki a accepté ta demande.', link: '/friends' },
    ],
  });
  console.log('✔ Notifications');
}

async function seedServerStatus(): Promise<void> {
  const count = await prisma.serverStatus.count();
  if (count > 0) return;
  const rows = [];
  for (let i = 48; i >= 0; i--) {
    const at = new Date(Date.now() - i * 30 * 60 * 1000);
    const hour = at.getHours() + at.getMinutes() / 60;
    const base = 12 + 20 * Math.exp(-((hour - 21) ** 2) / 18) + 10 * Math.exp(-((hour - 15) ** 2) / 10);
    rows.push({
      online: true,
      playerCount: Math.max(0, Math.round(base + (Math.random() * 6 - 3))),
      maxPlayers: 64,
      mapName: 'Yurei City',
      uptimeSeconds: 3600 * 24,
      version: '1.4.2-demo',
      latencyMs: 20 + Math.round(Math.random() * 15),
      maintenance: false,
      source: 'demo',
      recordedAt: at,
    });
  }
  await prisma.serverStatus.createMany({ data: rows });
  console.log('✔ Historique du serveur (fictif)');
}

async function main(): Promise<void> {
  console.log('🌱 Seed Yurei Project…');
  await seedRbac();

  if (!DEMO_ENABLED) {
    console.log('⏭ Données de démonstration ignorées (production sans SEED_DEMO=true)');
    return;
  }

  const ids = await seedUsers();
  await seedFriendships(ids);
  await seedConversations(ids);
  await seedTickets(ids);
  await seedAnnouncements(ids);
  await seedNotifications(ids);
  await seedServerStatus();
  console.log('✅ Seed terminé');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
