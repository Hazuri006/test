/**
 * Smoke test — boots the built game in Chromium, starts a match and
 * exercises every combat system, screenshotting each beat.
 *
 *   npm run build && npm run preview   (in one shell)
 *   node tests/smoke.mjs               (in another)
 *
 * Env: URL, OUT (screenshot dir), STAGE, CHROME (browser executable).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173/';
const OUT = process.env.OUT || 'tests/shots';
const STAGE = process.env.STAGE || 'wasteland';
const STAGES = ['wasteland', 'city', 'sanctuary', 'arena', 'volcano', 'void'];

mkdirSync(OUT, { recursive: true });

const launch = {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
};
if (process.env.CHROME) launch.executablePath = process.env.CHROME;

const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push(`CONSOLE ${m.text()}`);
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__app, { timeout: 20000 });
await page.waitForTimeout(2500);

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
};
const probe = () => page.evaluate(() => {
  const m = window.__app.match, f = m.fighters;
  return {
    phase: m.phase, timer: Math.round(m.timer),
    hp: f.map((x) => Math.round(x.hp)), ki: f.map((x) => Math.round(x.ki)),
    state: f.map((x) => x.state), sparking: f.map((x) => x.sparking),
    beams: m.activeBeams.length, projectiles: m.projectiles.length,
  };
});
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) errors.push(`ASSERT ${label}`);
};

/* ---- start a match ---- */
await page.evaluate((stageIndex) => {
  const a = window.__app;
  a.mode = 'vs-cpu';
  a.stageIndex = stageIndex;
  a.picks = [0, 1];
  a.startBattle();
}, Math.max(0, STAGES.indexOf(STAGE)));
await page.waitForTimeout(2600);
console.log('intro:', JSON.stringify(await probe()));
await shot('01-intro');

// skip the round intro so the fighters accept input
await page.evaluate(() => {
  const m = window.__app.match;
  m.phase = 'fight'; m.phaseT = 3;
  m.fighters.forEach((f) => (f.locked = false));
});
const startHp = (await probe()).hp[1];

/* ---- melee through the real input path ---- */
await page.keyboard.press('KeyJ');
const meleeState = await page.evaluate(() => new Promise((res) => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const f = window.__app.match.fighters[0];
    res({ state: f.state, clip: f.attackClip });
  }));
}));
check(`melee starts a rush (state=${meleeState.state})`,
  meleeState.state === 'attack' || meleeState.state === 'rushin');
await page.waitForTimeout(300);
await shot('02-melee');

/* ---- ki charge through the real input path ---- */
await page.evaluate(() => {
  const f = window.__app.match.fighters[0];
  f.ki = 20;
  f.setState('idle');          // a rush-in is still "busy" and ignores charge
  f.stopTrail();
});
await page.keyboard.down('KeyC');
await page.waitForTimeout(1000);
const charged = (await probe()).ki[0];
await page.keyboard.up('KeyC');
check(`holding charge refills ki (20 -> ${charged})`, charged > 25);
await shot('03-charge');

/* ---- sparking transformation ---- */
await page.evaluate(() => {
  const f = window.__app.match.fighters[0];
  f.ki = 100; f.enterSparking();
});
await page.waitForTimeout(700);
check('sparking active', (await probe()).sparking[0] === true);
await shot('04-sparking');

/* ---- super beam ---- */
await page.evaluate(() => {
  const m = window.__app.match, f = m.fighters[0];
  m.fx.clear(); f.setState('idle'); f.ki = 100;
  f.castKind = 'blast2'; f.castType = 'beam'; f.fireCast();
});
await page.waitForTimeout(900);
check('beam registered', (await probe()).beams >= 1);
await shot('05-beam');

/* ---- ultimate ---- */
await page.evaluate(() => {
  const m = window.__app.match, f = m.fighters[0];
  m.fx.clear(); f.setState('idle'); f.ki = 100; f.sparking = true; f.sparkT = 16;
  f.castKind = 'ultimate'; f.castType = 'beam'; f.fireCast();
});
await page.waitForTimeout(1500);
await shot('06-ultimate');
check('ultimate damages the opponent', (await probe()).hp[1] < startHp);

/* ---- ki blast projectile ---- */
const spawned = await page.evaluate(() => {
  const m = window.__app.match, f = m.fighters[0];
  m.fx.clear(); f.setState('idle'); f.castKind = 'kiblast'; f.fireCast();
  return m.projectiles.length;   // count immediately: a close-range shot connects fast
});
check('projectile spawned', spawned >= 1);
await page.waitForTimeout(250);
await shot('07-kiblast');

/* ---- vanish counter ---- */
await page.evaluate(() => {
  const f = window.__app.match.fighters[0];
  f.ki = 100; f.setState('hit', 0.3); f.vanishWindow = 0.4; f.doVanish();
});
await page.waitForTimeout(400);
await shot('08-vanish');

/* ---- split-screen local versus ---- */
await page.evaluate(() => {
  const a = window.__app;
  a.mode = 'vs-local'; a.stageIndex = 3; a.picks = [0, 4]; a.startBattle();
  const m = a.match;
  m.phase = 'fight'; m.phaseT = 3;
  m.fighters.forEach((f) => (f.locked = false));
});
await page.waitForTimeout(2000);
check('split-screen uses two cameras', await page.evaluate(() => window.__app.match.split === true));
await shot('09-split');

console.log('\nfps:', await page.evaluate(() => document.getElementById('fps')?.textContent));
console.log(errors.length ? `\nFAILURES:\n${errors.join('\n')}` : '\nAll checks passed, no console errors.');
await browser.close();
process.exit(errors.length ? 1 : 0);
