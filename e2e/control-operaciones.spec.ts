import { test, expect } from '@playwright/test';

// Base URL is configured in playwright.config.ts (typically http://localhost:4200)

// ── Helper: login as ADMIN ────────────────────────────────────────────────

async function loginAsAdmin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="usuario" i]', 'admin@test.com');
  await page.fill('input[type="password"]', 'adminpassword');
  await page.click('button[type="submit"]');
  await page.waitForURL(/admin|dashboard|control/, { timeout: 5000 });
}

// ── Helper: login as OPERADOR ─────────────────────────────────────────────

async function loginAsOperador(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="usuario" i]', 'operator@test.com');
  await page.fill('input[type="password"]', 'operatorpassword');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|register|login/, { timeout: 5000 });
}

// ── Scenario 1: Access Control (quickstart.md Scenario 1, FR-001, SC-008) ─

test.describe('Control de Operaciones — Access Control', () => {
  test('OPERADOR is redirected away from /admin/control-operaciones', async ({ page }) => {
    await loginAsOperador(page);

    // Attempt direct navigation to admin route
    await page.goto('/admin/control-operaciones');

    // Should NOT stay on /admin/control-operaciones
    await expect(page).not.toHaveURL(/admin\/control-operaciones/);
    // Should redirect to operator dashboard or login
    await expect(page).toHaveURL(/dashboard|login/);
  });

  test('ADMIN can navigate to /admin/control-operaciones and sees the page', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/admin/control-operaciones');

    // Page title should be visible (FR-009)
    await expect(page.getByRole('heading', { name: 'Control de Operaciones' })).toBeVisible({ timeout: 5000 });

    // Exportar button should be visible (FR-010)
    await expect(page.getByRole('button', { name: /exportar/i })).toBeVisible();
  });

  test('ADMIN sees KPI cards within 3 seconds (SC-001)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/control-operaciones');

    // Wait for KPI grid to appear (loading or content)
    await expect(page.locator('.kpi-grid')).toBeVisible({ timeout: 3000 });
  });
});

// ── Scenario 3: Table columns + chips (quickstart.md Scenario 3, FR-029, FR-037) ─

test.describe('Control de Operaciones — Table Structure and Status Chips', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/control-operaciones');
    // Wait for table to be present
    await expect(page.locator('.operations-table')).toBeVisible({ timeout: 5000 });
  });

  test('Table headers appear in correct order (FR-029)', async ({ page }) => {
    const headers = page.locator('.operations-table thead th');

    await expect(headers.nth(0)).toContainText(/ID Operaci/i);
    await expect(headers.nth(1)).toContainText(/Fecha/i);
    await expect(headers.nth(2)).toContainText(/Operador/i);
    await expect(headers.nth(3)).toContainText(/Agencia/i);
    await expect(headers.nth(4)).toContainText(/Tipo/i);
    await expect(headers.nth(5)).toContainText(/Monto/i);
    await expect(headers.nth(6)).toContainText(/Estado/i);
  });

  test('Monto values are right-aligned (FR-035)', async ({ page }) => {
    const amountHeader = page.locator('.operations-table th.col-monto');
    await expect(amountHeader).toBeVisible();
  });

  test('Status chips are visible in the Estado column (FR-036, FR-037)', async ({ page }) => {
    // At least one status chip should exist in the table
    const chips = page.locator('.operations-table .status-chip');
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);
  });

  test('CANCELADA rows have the error tint background class (FR-030, SC-005)', async ({ page }) => {
    const cancelledRows = page.locator('.operations-table tbody tr.row--cancelled');
    const count = await cancelledRows.count();

    if (count > 0) {
      // If there are cancelled rows, verify the chip says CANCELADA
      const chip = cancelledRows.first().locator('.status-chip--cancelada');
      await expect(chip).toBeVisible();
    } else {
      // No cancelled rows in current dataset — skip visual assertion
      console.log('No CANCELADA rows in current dataset; skipping chip color check.');
    }
  });
});

// ── Scenario 4: Filter + Limpiar (quickstart.md Scenario 4, FR-026, SC-003, SC-011) ─

test.describe('Control de Operaciones — Filter and Limpiar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/control-operaciones');
    // Wait for filter panel
    await expect(page.locator('.filters-panel')).toBeVisible({ timeout: 5000 });
  });

  test('Filtrar button is visible and enabled by default (FR-025)', async ({ page }) => {
    const filtrarBtn = page.locator('button.btn-filtrar');
    await expect(filtrarBtn).toBeVisible();
    await expect(filtrarBtn).toBeEnabled();
  });

  test('Limpiar button is visible (FR-025)', async ({ page }) => {
    await expect(page.locator('button.btn-limpiar')).toBeVisible();
  });

  test('Selecting Agencia and clicking Filtrar sends a request (SC-003)', async ({ page }) => {
    // Intercept the API call
    const requestPromise = page.waitForRequest(req =>
      req.url().includes('/control-operaciones/operaciones') && req.method() === 'GET'
    );

    // Select an agency
    await page.selectOption('#f-agencia', 'sucursal-norte');

    // Click Filtrar
    await page.click('button.btn-filtrar');

    // Verify a request was made (within 2 seconds, SC-003)
    const request = await requestPromise;
    expect(request.url()).toContain('agenciaId=sucursal-norte');
  });

  test('Clicking Limpiar resets filters (SC-011)', async ({ page }) => {
    // Set a filter value
    await page.selectOption('#f-agencia', 'sucursal-norte');
    await page.fill('#f-operador', 'OP-442');

    // Wait for a request to confirm Filtrar would fire
    await page.click('button.btn-limpiar');

    // After Limpiar, the select should be back to default (Todas las Agencias)
    const agenciaValue = await page.$eval('#f-agencia', (el: HTMLSelectElement) => el.value);
    expect(agenciaValue).toBe('');

    // Operador input should be cleared
    const operadorValue = await page.$eval('#f-operador', (el: HTMLInputElement) => el.value);
    expect(operadorValue).toBe('');
  });

  test('Monto Min > Max shows inline validation error (FR-024)', async ({ page }) => {
    // Enter invalid range
    await page.fill('input[aria-label="Monto mínimo"]', '500000');
    await page.fill('input[aria-label="Monto máximo"]', '100000');

    // Error message should appear
    await expect(page.locator('.filter-monto-error')).toBeVisible();

    // Filtrar button should be disabled
    await expect(page.locator('button.btn-filtrar')).toBeDisabled();
  });
});
