import './ui/styles.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
const uiRoot = document.getElementById('ui-root');

if (!canvas || !uiRoot) {
  throw new Error('DRIFTWAKE: éléments DOM manquants (#game-canvas / #ui-root).');
}

// WebGL availability check with a friendly fallback message.
const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
if (!gl) {
  uiRoot.innerHTML =
    '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#f1e6d2;font-family:sans-serif;text-align:center;padding:24px">' +
    'WebGL n’est pas disponible dans ce navigateur.<br/>Essayez un navigateur moderne (Chrome, Firefox, Edge, Safari récents).' +
    '</div>';
} else {
  new Game(canvas, uiRoot);
}
