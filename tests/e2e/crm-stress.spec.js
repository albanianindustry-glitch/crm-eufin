import { test, expect } from '@playwright/test';

const BASE_URL = process.env.CRM_BASE_URL;
const ROLE = process.env.CRM_AUDIT_ROLE;
const ROLE_CREDENTIALS = {
  admin: [process.env.CRM_ADMIN_EMAIL, process.env.CRM_ADMIN_PASSWORD],
  accountant: [process.env.CRM_ACCOUNTANT_EMAIL, process.env.CRM_ACCOUNTANT_PASSWORD]
};
const [EMAIL, PASSWORD] = ROLE_CREDENTIALS[ROLE] || [];

test.describe(`CRM — Integrated Stress Audit (${ROLE || 'no role'})`, () => {
  test.skip(!BASE_URL || !EMAIL || !PASSWORD,
    'Set staging CRM_BASE_URL, CRM_AUDIT_ROLE, and the matching role credentials.');

  test.setTimeout(120_000);

  let consoleErrors;
  let pageErrors;
  let failedResponses;
  let page;

  test.beforeEach(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();

    consoleErrors = [];
    pageErrors = [];
    failedResponses = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', error => pageErrors.push(error.message));

    page.on('response', response => {
      if (response.status() >= 500) {
        failedResponses.push({
          status: response.status(),
          url: response.url()
        });
      }
    });

    await page.goto(new URL('/login.html', BASE_URL).href);
    await page.locator('input[type="password"]').fill(PASSWORD);

    const emailInput = page.locator(
      'input[type="email"], input[name*="email" i], input[name*="user" i]'
    ).first();

    await emailInput.fill(EMAIL);
    const loginResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/login'),
      { timeout: 15000 }
    ).catch(() => null);

    await page.locator('form button, form input[type="submit"]').first().click();

    const loginResponse = await loginResponsePromise;

    console.log('=== LOGIN HTTP ===', JSON.stringify({
      status: loginResponse ? loginResponse.status() : null
    }));

    try {
      await page.waitForURL(
        url => !url.pathname.endsWith('/login.html'),
        { timeout: 10000 }
      );
    } catch {
      console.log('=== LOGIN REDIRECT === Nuk u largua nga faqja e hyrjes brenda 10 sekondave.');
    }

    await expect(page.locator('body')).not.toContainText(/internal server error/i);
  });

  test.afterEach(async () => {
    await page?.context().close();
  });

  test('01 — Login and application shell load', async () => {
    const loginError = await page.locator('#e').innerText().catch(() => '');
    const result = {
      url: page.url(),
      title: await page.title(),
      loginError,
      crmUserBar: await page.locator('#xbar').count(),
    };

    console.log('=== LOGIN DIAGNOSTICS ===\\n' + JSON.stringify(result, null, 2));

    expect(page.url(), 'Pas login-it duhet të hapet CRM-ja, jo faqja e hyrjes')
      .not.toContain('/login.html');
    await expect(page.locator('#xbar'), 'Shiriti i përdoruesit duhet të ngarkohet')
      .toBeVisible();
    await expect(page.locator('#xbar')).toContainText(
      ROLE === 'admin' ? 'administrator' : 'kontabilist'
    );
    await expect(page.locator('body')).not.toContainText(/internal server error/i);
  });

  test('02 — Inventory all modules, controls and forms', async () => {
    const inventory = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      headings: [...document.querySelectorAll('h1,h2,h3')]
        .map(e => e.innerText.trim()).filter(Boolean),
      navigation: [...document.querySelectorAll('nav a, nav button, aside a, aside button, [role="tab"]')]
        .map(e => ({
          text: (e.innerText || e.getAttribute('aria-label') || '').trim(),
          href: e.getAttribute('href'),
          id: e.id
        })),
      buttons: [...document.querySelectorAll('button,input[type="button"],input[type="submit"]')]
        .map(e => ({
          text: (e.innerText || e.value || e.getAttribute('aria-label') || '').trim(),
          id: e.id,
          disabled: e.disabled,
          type: e.type
        })),
      forms: [...document.forms].map((form, index) => ({
        index,
        id: form.id,
        action: form.action,
        method: form.method,
        fields: [...form.querySelectorAll('input,select,textarea')]
          .map(e => ({
            tag: e.tagName,
            type: e.type || '',
            name: e.name,
            id: e.id,
            required: e.required
          }))
      }))
    }));

    console.log('\n=== CRM UI INVENTORY ===\n' + JSON.stringify(inventory, null, 2));
    expect(inventory.title).toBeTruthy();
    expect(inventory.buttons.length + inventory.navigation.length).toBeGreaterThan(0);
  });

  test('03 — Navigate every visible navigation item', async () => {
    const items = page.locator(
      'nav a:visible, nav button:visible, aside a:visible, aside button:visible, [role="tab"]:visible'
    );

    const count = await items.count();
    const results = [];

    for (let i = 0; i < count; i++) {
      const item = items.nth(i);

      try {
        const label = (await item.innerText().catch(() => '')) ||
          (await item.getAttribute('aria-label')) || `item-${i}`;

        if (!(await item.isVisible()) || !(await item.isEnabled())) continue;

        await item.click({ timeout: 3000 });
        await page.waitForTimeout(150);

        results.push({
          label: label.trim(),
          url: page.url(),
          bodyPresent: await page.locator('body').isVisible()
        });
      } catch (error) {
        results.push({ index: i, error: String(error).slice(0, 250) });
      }
    }

    console.log('\n=== NAVIGATION RESULTS ===\n' + JSON.stringify(results, null, 2));
    expect(await page.locator('body').count()).toBe(1);
    expect(page.url()).toContain(new URL(BASE_URL).host);
  });

  test('04 — Inspect form validation without submitting', async () => {
    const forms = page.locator('form:visible');
    const count = await forms.count();
    const results = [];

    for (let i = 0; i < count; i++) {
      const form = forms.nth(i);

      try {
        const state = await form.evaluate(f => ({
          id: f.id,
          valid: [...f.querySelectorAll('input,select,textarea')]
            .every(e => e.validity.valid),
          requiredFields: [...f.querySelectorAll('input,select,textarea')]
            .filter(e => e.required)
            .map(e => ({
              name: e.name,
              id: e.id,
              type: e.type,
              valuePresent: Boolean(e.value)
            })),
          invalidFields: [...f.querySelectorAll('input,select,textarea')]
            .filter(e => !e.validity.valid)
            .map(e => ({
              name: e.name,
              id: e.id,
              type: e.type,
              required: e.required
            })),
          message: f.querySelector('[role="alert"]')?.textContent?.trim() || ''
        }));

        results.push(state);
      } catch (error) {
        results.push({ index: i, error: String(error).slice(0, 250) });
      }
    }

    console.log('\n=== FORM VALIDATION INVENTORY ===\n' + JSON.stringify(results, null, 2));
    expect(await page.locator('body').count()).toBe(1);
  });

  test('05 — Check buttons for missing labels and broken state', async () => {
    const findings = await page.evaluate(() => ({
      unlabeledButtons: [...document.querySelectorAll('button')]
        .filter(e => !(
          e.innerText.trim() ||
          e.getAttribute('aria-label') ||
          e.getAttribute('title')
        ))
        .map(e => ({ html: e.outerHTML.slice(0, 300) })),
      unlabeledInputs: [...document.querySelectorAll('input:not([type="hidden"]),textarea,select')]
        .filter(e => {
          const label = e.labels?.length ||
            e.getAttribute('aria-label') ||
            e.getAttribute('aria-labelledby');
          return !label;
        })
        .map(e => ({ tag: e.tagName, type: e.type, id: e.id, name: e.name })),
      brokenImages: [...document.images]
        .filter(e => !e.complete || e.naturalWidth === 0)
        .map(e => e.src),
      duplicateIds: [...document.querySelectorAll('[id]')]
        .map(e => e.id)
        .filter((id, i, all) => all.indexOf(id) !== i)
    }));

    console.log('\n=== UI QUALITY FINDINGS ===\n' + JSON.stringify(findings, null, 2));
    expect(findings.unlabeledButtons, 'Buttons without accessible labels').toEqual([]);
    expect(findings.unlabeledInputs, 'Inputs without accessible labels').toEqual([]);
    expect(findings.brokenImages, 'Broken images').toEqual([]);
    expect(findings.duplicateIds, 'Duplicate DOM ids').toEqual([]);
    expect(await page.locator('body').count()).toBe(1);
  });

  test('06 — Report runtime errors and server failures', async () => {
    await page.waitForTimeout(1000);

    console.log('\n=== RUNTIME ERRORS ===\n' + JSON.stringify(consoleErrors, null, 2));
    console.log('\n=== PAGE ERRORS ===\n' + JSON.stringify(pageErrors, null, 2));
    console.log('\n=== HTTP 5XX ===\n' + JSON.stringify(failedResponses, null, 2));

    expect(consoleErrors, 'Browser console errors').toEqual([]);
    expect(pageErrors, 'Uncaught browser JavaScript errors').toEqual([]);
    expect(failedResponses, 'Server returned HTTP 5xx').toEqual([]);
  });
});
