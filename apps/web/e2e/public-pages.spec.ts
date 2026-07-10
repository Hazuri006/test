import { expect, test } from '@playwright/test';

test.describe('Page de connexion', () => {
  test('affiche le logo, le nom du projet et le bouton Discord', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /yurei project/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /discord/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /mentions légales/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /confidentialité/i })).toBeVisible();
  });

  test("affiche un message d'erreur quand Discord refuse la connexion", async ({ page }) => {
    await page.goto('/login?error=discord_denied');
    // Le toaster expose aussi un role=alert : on cible celui du message OAuth
    await expect(page.getByRole('alert').filter({ hasText: /discord/i })).toBeVisible();
  });

  test('ne déborde pas horizontalement sur mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto('/login');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});

test.describe('Protection des routes', () => {
  test('redirige un visiteur sans session vers /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('redirige la racine vers /login sans session', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Pages légales', () => {
  test('mentions légales accessibles sans connexion', async ({ page }) => {
    await page.goto('/legal/terms');
    await expect(page.getByRole('heading', { name: /mentions légales/i })).toBeVisible();
  });

  test('politique de confidentialité accessible sans connexion', async ({ page }) => {
    await page.goto('/legal/privacy');
    await expect(page.getByRole('heading', { name: /confidentialité/i })).toBeVisible();
  });
});
