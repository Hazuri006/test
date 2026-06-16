import { ItemDatabase } from '../inventory/ItemDatabase';

/**
 * Renders an original, procedural icon for each item as a data URL.
 * The icon is a rounded gem of the item's colour with its short glyph, so the
 * UI needs no external image assets. Cached per item id.
 */
export class IconFactory {
  private static cache = new Map<string, string>();

  static get(itemId: string, size = 64): string {
    const key = `${itemId}-${size}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const def = ItemDatabase.has(itemId) ? ItemDatabase.get(itemId) : null;
    const color = def?.color ?? '#888';
    const color2 = def?.color2 ?? color;
    const glyph = def?.glyph ?? '?';

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const r = size * 0.18;
    const pad = size * 0.1;
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color2);
    ctx.fillStyle = grad;
    roundRect(ctx, pad, pad, size - pad * 2, size - pad * 2, r);
    ctx.fill();

    // Glossy highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, pad + 3, pad + 3, size - pad * 2 - 6, (size - pad * 2) * 0.4, r * 0.7);
    ctx.fill();

    // Border.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    roundRect(ctx, pad, pad, size - pad * 2, size - pad * 2, r);
    ctx.stroke();

    // Glyph.
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.floor(size * 0.3)}px 'Trebuchet MS', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 3;
    ctx.fillText(glyph, size / 2, size / 2 + size * 0.04);

    const url = canvas.toDataURL();
    this.cache.set(key, url);
    return url;
  }

  static css(itemId: string): string {
    return `url(${this.get(itemId)})`;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
