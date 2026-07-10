import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

const DISCORD_API = 'https://discord.com/api/v10';

export interface DiscordTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface DiscordProfile {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  banner: string | null;
  email?: string | null;
}

/** Client OAuth2 / API Discord. Le Client Secret ne quitte jamais le backend. */
@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);

  buildAuthorizeUrl(state: string): string {
    const scopes = ['identify'];
    if (env.DISCORD_REQUEST_EMAIL) scopes.push('email');
    const params = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      redirect_uri: env.DISCORD_REDIRECT_URI,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      prompt: 'consent',
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<DiscordTokens> {
    const res = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.DISCORD_REDIRECT_URI,
      }),
    });
    if (!res.ok) {
      this.logger.warn(`Échange OAuth Discord refusé (HTTP ${res.status})`);
      throw new BadGatewayException('Discord a refusé la connexion');
    }
    return (await res.json()) as DiscordTokens;
  }

  async fetchProfile(accessToken: string): Promise<DiscordProfile> {
    const res = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new BadGatewayException('Impossible de récupérer le profil Discord');
    return (await res.json()) as DiscordProfile;
  }

  avatarUrl(profile: Pick<DiscordProfile, 'id' | 'avatar'>): string {
    if (profile.avatar) {
      const ext = profile.avatar.startsWith('a_') ? 'gif' : 'png';
      return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${ext}?size=256`;
    }
    const index = Number((BigInt(profile.id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }

  bannerUrl(profile: Pick<DiscordProfile, 'id' | 'banner'>): string | null {
    if (!profile.banner) return null;
    const ext = profile.banner.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/banners/${profile.id}/${profile.banner}.${ext}?size=1024`;
  }
}
