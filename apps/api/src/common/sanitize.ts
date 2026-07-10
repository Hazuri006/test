import sanitizeHtml from 'sanitize-html';

/**
 * Texte brut : supprime toute balise HTML. Le frontend affiche le contenu en
 * texte (jamais en HTML injecté), ceci est une seconde ligne de défense.
 */
export function sanitizePlainText(input: string): string {
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).trim();
}

/** Contenu riche des annonces : sous-ensemble HTML sûr. */
export function sanitizeRichContent(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [
      'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'blockquote', 'code', 'pre',
      'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'img', 'hr',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt'],
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
    },
  });
}
