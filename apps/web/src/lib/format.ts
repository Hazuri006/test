/** Formatage local des dates (fr/en). */

export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const rtf = new Intl.RelativeTimeFormat(locale === 'en' ? 'en' : 'fr', { numeric: 'auto' });
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return locale === 'en' ? 'just now' : "à l'instant";
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, 'day');
  return rtf.format(-Math.round(days / 30), 'month');
}

export function formatUptime(seconds: number, locale: string): string {
  const h = Math.floor(seconds / 3600);
  const d = Math.floor(h / 24);
  if (d > 0) return locale === 'en' ? `${d}d ${h % 24}h` : `${d}j ${h % 24}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}min`;
}
