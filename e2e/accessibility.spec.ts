import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

/**
 * Automated WCAG 2.2 A/AA accessibility checks (SC-007).
 * Covers the principal PWA states: initial, loaded history, empty history, error states.
 *
 * Manual checks remain required for complete conformance evidence.
 */
test.describe('WCAG 2.2 A/AA — Operations PWA', () => {

  test('registration form has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="btn-submit"]');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    expect(results.violations).toHaveLength(0);
  });

  test('loaded history has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    // Wait for history to load (empty or populated)
    await page.waitForSelector('[data-testid="empty-history"], [data-testid="operation-item"]');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    expect(results.violations).toHaveLength(0);
  });

  test('empty history state has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    const emptyEl = page.locator('[data-testid="empty-history"]');
    if (await emptyEl.isVisible()) {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toHaveLength(0);
    }
  });

  test('type field error state has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="btn-submit"]');

    // Submit without filling in to trigger validation errors
    await page.click('[data-testid="btn-submit"]');
    await page.waitForTimeout(200);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    expect(results.violations).toHaveLength(0);
  });

});

/**
 * Smoke test: successful registration and history flow.
 * Requires backend to be running at http://localhost:8081.
 */
test.describe('Registration flow (requires backend)', () => {

  test.skip(
    !process.env['E2E_BACKEND_RUNNING'],
    'Skipped: set E2E_BACKEND_RUNNING=1 to run integration tests'
  );

  test('registers an operation and sees it in history', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="field-type"]');

    // Select DEPOSITO
    await page.click('[data-testid="field-type"]');
    await page.click('[data-testid="type-option"]:has-text("DEPOSITO")');

    // Enter amount
    await page.fill('[data-testid="field-amount"]', '100.00');

    // Submit
    await page.click('[data-testid="btn-submit"]');

    // Verify history shows the new operation
    await page.waitForSelector('[data-testid="operation-item"]', { timeout: 5000 });
  });
});
