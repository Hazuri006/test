// Headless smoke test: boots the built game in Chromium (SwiftShader WebGL),
// starts a new game, exercises input, and fails on any console/page error.
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:4173';

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
page.on('dialog', (d) => d.accept('SmokeSave'));

let ok = true;
try {
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1500);

  const webgl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { ok: false, renderer: 'none' };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return { ok: true, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown' };
  });
  console.log('WebGL available:', webgl.ok, '| renderer:', webgl.renderer);

  // Start a new game.
  await page.getByRole('button', { name: /Nouvelle partie/ }).click();
  await page.waitForTimeout(3500); // world generation + first frames

  // Confirm the HUD is up (hotbar rendered).
  const hotbarSlots = await page.locator('.hotbar .slot').count();
  console.log('Hotbar slots:', hotbarSlots);

  // Capture a clean gameplay frame (ocean + raft + sky, no menu).
  await page.screenshot({ path: 'scripts/smoke-gameplay.png' });

  // Exercise input: look, move, open inventory, build menu, hotbar select.
  await page.mouse.click(640, 360);
  await page.mouse.move(700, 360);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('Tab'); // open inventory
  await page.waitForTimeout(500);
  const invVisible = await page.locator('.overlay').first().isVisible();
  console.log('Inventory opens:', invVisible);
  await page.keyboard.press('Tab'); // close
  await page.waitForTimeout(300);
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(200);

  // Let several seconds of simulation run (waves, day/night, shark, debris).
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'scripts/smoke.png' });
  console.log('Screenshot saved to scripts/smoke.png');

  if (!webgl.ok) {
    console.error('FAIL: WebGL not available');
    ok = false;
  }
  if (hotbarSlots !== 5) {
    console.error('FAIL: expected 5 hotbar slots, got', hotbarSlots);
    ok = false;
  }
} catch (e) {
  console.error('FAIL: exception during smoke test:', e);
  ok = false;
}

if (errors.length) {
  ok = false;
  console.error(`\n${errors.length} runtime error(s):`);
  for (const e of errors.slice(0, 30)) console.error(' - ' + e);
} else {
  console.log('No console/page errors captured.');
}

await browser.close();
console.log(ok ? '\nSMOKE TEST PASSED' : '\nSMOKE TEST FAILED');
process.exit(ok ? 0 : 1);
