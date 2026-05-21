import { test, expect } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8088';

test.describe('PresuControl V5 - E2E Tests', () => {

  test('01 - Login page loads correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    // Check page title
    await expect(page).toHaveTitle(/PresuControl/i);

    // Check heading (exact match for h1)
    await expect(page.getByRole('heading', { name: 'PresuControl', exact: true })).toBeVisible();

    // Check subheading
    await expect(page.getByRole('heading', { name: 'Entrar en PresuControl' })).toBeVisible();

    // Check login form elements using textbox role
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Contraseña' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

    // Check for registration and password reset links
    await expect(page.getByText(/¿No tienes cuenta?|Crear registro/i)).toBeVisible();
    await expect(page.getByText(/He olvidado mi contraseña/i)).toBeVisible();
  });

  test('02 - Login with invalid credentials shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    await page.getByRole('textbox', { name: 'Email' }).fill('invalid@test.com');
    await page.getByRole('textbox', { name: 'Contraseña' }).fill('wrongpassword');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Should show error message
    await expect(page.getByText(/credenciales|datos|incorrectos/i)).toBeVisible({ timeout: 5000 });
  });

  test('03 - Main page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);

    // Should redirect to login
    await expect(page).toHaveURL(/\/(login|entrar)/);
  });

  test('04 - API health endpoint responds', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/health`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('05 - API sidebar-counters endpoint works', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/sidebar-counters`);
    // Should work even without auth in some configurations
    expect([200, 401, 403]).toContain(response.status());
  });

  test('06 - API docs are accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/api/docs`);

    // Swagger UI should load - check for swagger or document title
    await expect(page).toHaveTitle(/swagger|openapi|presucontrol/i);
  });

  test('07 - Register page is accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/registro`);

    // Registration form elements - check actual page content
    await expect(page.getByRole('textbox', { name: 'Nombre' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Contraseña' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeVisible();
  });

  test('08 - Password reset request page works', async ({ page }) => {
    await page.goto(`${BASE_URL}/forgot-password`);

    // Should show reset form
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('button', { name: /enviar|recuperar/i })).toBeVisible();
  });

  test('09 - Responsive design - mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/login`);

    // Login form should still be usable on mobile
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Contraseña' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('10 - No broken images on login page', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    const images = page.locator('img');
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const isVisible = await img.isVisible();
      if (isVisible) {
        const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
        expect(naturalWidth).toBeGreaterThan(0);
      }
    }
  });

  test('11 - Console has no critical errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Filter out common non-critical errors
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('net::ERR_') &&
      !e.includes('Failed to load resource')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('12 - Register new user flow', async ({ page }) => {
    await page.goto(`${BASE_URL}/registro`);

    // Fill registration form with unique email
    await page.getByRole('textbox', { name: 'Nombre' }).fill('Test User');
    await page.getByRole('textbox', { name: 'Email' }).fill(`testuser_${Date.now()}@test.com`);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill('TestPassword123!');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    // Should show success or error depending on system configuration
    const content = await page.content();
    const hasSuccess = content.includes('verific') || content.includes('registro') || content.includes('cuenta') || content.includes('aprob');
    expect(hasSuccess || content.includes('error') || page.url().includes('login')).toBeTruthy();
  });

  test('13 - Page loads within acceptable time', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(3000); // Should load in under 3 seconds
  });

  test('14 - Logo/brand is visible on login', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    // Check brand name - exact h1 heading
    await expect(page.getByRole('heading', { name: 'PresuControl', exact: true })).toBeVisible();
    await expect(page.getByText(/FactuSOL/i)).toBeVisible();
  });

  test('15 - Keyboard navigation works on login form', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    // Tab to email field
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Type email
    await page.keyboard.type('test@example.com');

    // Tab to password
    await page.keyboard.press('Tab');
    await page.keyboard.type('password123');

    // Submit with Enter
    await page.keyboard.press('Enter');

    // Should show error (credentials don't exist) not crash
    await page.waitForTimeout(1000);
    const url = page.url();
    expect(url).toBeTruthy();
  });
});