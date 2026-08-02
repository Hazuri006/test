#!/usr/bin/env node
'use strict';
/* ============================================================================
   tools/check.js — static sanity checks that run without a browser.

     node tools/check.js

   1. Every module must parse as JavaScript.
   2. No stray backticks inside the GLSL template literals in shaders.js.
      (A backtick in a shader comment silently terminates the template and
      turns the rest of the shader into broken JavaScript — it has bitten this
      file twice, and the error message points nowhere near the cause.)
   3. Every uniform a shader declares should be referenced somewhere in the JS,
      and every uniform the JS sets should exist in some shader.
   ============================================================================ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS = ['math.js', 'gl.js', 'shaders.js', 'planets.js', 'terrain.js',
  'props.js', 'debris.js', 'ship.js', 'character.js',
  'player.js', 'audio.js', 'hud.js', 'game.js'];

let failed = 0;
const fail = (msg) => { console.error('  FAIL  ' + msg); failed++; };
const ok = (msg) => console.log('  ok    ' + msg);

/* ---- 1. parse ---------------------------------------------------------- */
console.log('\nparsing modules');
const sources = {};
for (const f of JS) {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  sources[f] = src;
  try { new Function(src); ok(f); }
  catch (e) { fail(f + ' — ' + e.message); }
}

/* ---- 2. backticks inside GLSL ------------------------------------------ */
console.log('\nshader template literals');
{
  const src = sources['shaders.js'];
  // Template literals in this file always open with ` and close with `;
  // so an odd count means one of them was closed early by a stray tick.
  const ticks = (src.match(/`/g) || []).length;
  if (ticks % 2 !== 0) fail('odd number of backticks (' + ticks + ') — a GLSL comment probably contains one');
  else ok(ticks + ' backticks, balanced');

  // Any backtick that is not immediately at a literal boundary is suspect.
  const lines = src.split('\n');
  let suspicious = 0;
  lines.forEach((line, i) => {
    if (!line.includes('`')) return;
    const boundary = /^\s*`;\s*$/.test(line) || /`$/.test(line.trimEnd()) || /=\s*`/.test(line) || /\+\s*`/.test(line);
    if (!boundary) { fail('shaders.js:' + (i + 1) + ' backtick inside shader text: ' + line.trim().slice(0, 70)); suspicious++; }
  });
  if (!suspicious) ok('no backticks inside shader bodies');
}

/* ---- 3. uniform cross-reference ---------------------------------------- */
console.log('\nuniform cross-reference');
{
  const shaderSrc = sources['shaders.js'];
  const declared = new Set();
  const re = /uniform\s+(?:lowp\s+|mediump\s+|highp\s+)?\w+\s+([^;]+);/g;
  let m;
  while ((m = re.exec(shaderSrc))) {
    for (const name of m[1].split(',')) {
      const n = name.trim().replace(/\[.*\]$/, '');
      if (/^u[A-Z]/.test(n)) declared.add(n);
    }
  }

  const jsAll = JS.filter(f => f !== 'shaders.js').map(f => sources[f]).join('\n');
  const used = new Set();
  const ure = /\bu\.(u[A-Za-z0-9_]+)|['"](u[A-Z][A-Za-z0-9_]*)['"]/g;
  while ((m = ure.exec(jsAll))) used.add(m[1] || m[2]);

  const unset = [...declared].filter(n => !used.has(n));
  const unknown = [...used].filter(n => !declared.has(n));

  if (unknown.length) fail('JS sets uniforms no shader declares: ' + unknown.join(', '));
  else ok('every uniform the JS sets exists in a shader');

  if (unset.length) console.log('  note  declared but never set from JS (may be intentional): ' + unset.join(', '));
  else ok('every declared uniform is set from JS');
}

console.log(failed ? '\n' + failed + ' check(s) failed\n' : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
