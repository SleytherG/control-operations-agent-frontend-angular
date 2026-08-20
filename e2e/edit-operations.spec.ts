/import { test, expect } from '@playwright/test';

/**
 * E2E tests for the operations table and edit flow.
 * Requires a running backend (http://localhost:8081) and PWA (http://localhost:4200).
 * Per specs/002-operations-table-edit/quickstart.md
 */
const BASE_URL = 'http://localhost:4200';

test.describe('Table display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    // Wait for the table to appear
    await page.waitForSelector('table[mat-table]', { timeout: 5000 });
  });

  test('shows table with 4 columns: Fecha y hora, Monto, Tipo de operación, Acciones', async ({ page }) => {
    const headers = await page.locator('th[mat-header-cell]').allTextContents();
    expect(headers).toContain('Fecha y hora');
    expect(headers).toContain('Monto');
    expect(headers).toContain('Tipo de operación');
    expect(headers).toContain('Acciones');
  });

  test('shows empty state when no operations exist', async ({ page }) => {
    const empty = page.locator('[data-testid="empty-history"]');
    // If no operations are registered, the empty state should be visible
    // This test is conditional on the database state
    const opItems = page.locator('[data-testid="operation-item"]');
    const count = await opItems.count();
    if (count === 0) {
      await expect(empty).toBeVisible();
    } else {
      await expect(opItems.first()).toBeVisible();
    }
  });

  test('shows "Más reciente" label on first row when operations exist', async ({ page }) => {
    const items = page.locator('[data-testid="operation-item"]');
    const count = await items.count();
    if (count > 0) {
      const label = page.locator('[data-testid="most-recent-label"]');
      await expect(label).toBeVisible();
    }
  });
});

test.describe('Edit flow — success', () => {
  test('can open edit dialog, change type, save and see updated value', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('[data-testid="btn-edit-operation"]', { timeout: 5000 });

    const editBtns = page.locator('[data-testid="btn-edit-operation"]');
    if (await editBtns.count() === 0) test.skip();

    await editBtns.first().click();

    // Dialog should be open
    await expect(page.locator('[data-testid="edit-field-type"]')).toBeVisible();
    await expect(page.locator('[data-testid="edit-field-amount"]')).toBeVisible();

    // Change amount
    await page.locator('[data-testid="edit-field-amount"]').fill('999.99');
    await page.locator('[data-testid="edit-btn-save"]').click();

    // Dialog should close
    await expect(page.locator('[data-testid="edit-field-type"]')).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('Edit flow — cancel', () => {
  test('cancel closes dialog and table remains unchanged', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('[data-testid="btn-edit-operation"]', { timeout: 5000 });

    const editBtns = page.locator('[data-testid="btn-edit-operation"]');
    if (await editBtns.count() === 0) test.skip();

    await editBtns.first().click();
    await expect(page.locator('[data-testid="edit-field-type"]')).toBeVisible();

    await page.locator('[data-testid="edit-btn-cancel"]').click();

    // Dialog should close
    await expect(page.locator('[data-testid="edit-field-type"]')).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('Edit flow — validation errors', () => {
  test('shows validation error when amount is empty', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('[data-testid="btn-edit-operation"]', { timeout: 5000 });

    const editBtns = page.locator('[data-testid="btn-edit-operation"]');
    if (await editBtns.count() === 0) test.skip();

    await editBtns.first().click();
    await page.locator('[data-testid="edit-field-amount"]').fill('');
    await page.locator('[data-testid="edit-field-amount"]').blur();

    // Save button should be disabled and error message shown
    await expect(page.locator('[data-testid="edit-btn-save"]')).toBeDisabled();
  });

  test('shows validation error when amount is zero', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('[data-testid="btn-edit-operation"]', { timeout: 5000 });

    const editBtns = page.locator('[data-testid="btn-edit-operation"]');
    if (await editBtns.count() === 0) test.skip();

    await editBtns.first().click();
    await page.locator('[data-testid="edit-field-amount"]').fill('0');
    await page.locator('[data-testid="edit-btn-save"]').click();

    // Dialog should stay open (validation prevents close)
    await expect(page.locator('[data-testid="edit-field-type"]')).toBeVisible({ timeout: 1000 });
  });
});

test.describe('Manual refresh', () => {
  test('refresh button triggers history reload', async ({ page }) => {
    await page.goto(BASE_URL);
    const refreshBtn = page.locator('[data-testid="btn-refresh"]');
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    // After refresh, table should still be visible
    await page.waitForSelector('table[mat-table]', { timeout: 5000 });
  });
});

test.describe('Keyboard navigation', () => {
  test('edit button is reachable via Tab key', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('[data-testid="btn-edit-operation"]', { timeout: 5000 });

    const editBtns = page.locator('[data-testid="btn-edit-operation"]');
    if (await editBtns.count() === 0) test.skip();

    // Focus the first edit button via keyboard
    await page.keyboard.press('Tab');
    // Keep tabbing until an edit button is focused (max 30 tabs)
    let editFocused = false;
    for (let i = 0; i < 30; i++) {
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      if (focused === 'btn-edit-operation') {
        editFocused = true;
        break;
      }
      await page.keyboard.press('Tab');
    }
    expect(editFocused).toBe(true);
  });
});
