/**
 * Wrapper CLI Prisma : charge le .env racine du monorepo avant d'exécuter
 * la commande (la CLI Prisma ne lit que le .env du dossier courant).
 * Usage: node scripts/prisma-env.js migrate dev
 */
const path = require('path');
const { spawnSync } = require('child_process');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config();

const result = spawnSync('npx', ['prisma', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
