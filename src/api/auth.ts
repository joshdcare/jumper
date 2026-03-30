import { chromium } from 'playwright';
import crypto from 'crypto';
import type { EnvConfig } from '../types.js';

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function getAccessToken(
  email: string,
  envConfig: EnvConfig
): Promise<string> {
  const maxRetries = 3;

  const { baseUrl } = envConfig;
  const haAuthority = `${baseUrl}/api/id-oidc-proxy/ha`;
  const clientId = 'oidc-proxy';
  const scope = 'openid offline profile email';
  const redirectUri = `${baseUrl}/app/id-oidc-client/signin-callback.html`;

  for (let retry = 0; retry < maxRetries; retry++) {
    let browser;
    try {
      const { verifier, challenge } = generatePKCE();
      const state = crypto.randomBytes(16).toString('hex');

      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      let authCode: string | undefined;

      page.on('request', (req) => {
        const url = req.url();
        if (url.includes('signin-callback') && url.includes('code=')) {
          const parsed = new URL(url);
          authCode = parsed.searchParams.get('code') ?? undefined;
        }
      });

      const authUrl = new URL(`${haAuthority}/oauth2/authorize`);
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      await page.goto(authUrl.toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Stage 1: Hydra custom login page — enter email and click Continue
      const emailInput = page
        .locator('input[type="email"], input[name="email"], #username, #emailId')
        .first();
      await emailInput.waitFor({ timeout: 15000 });
      await emailInput.clear();
      await emailInput.fill(email);

      const continueButton = page.getByRole('button', {
        name: 'Continue',
        exact: true,
      });
      if (await continueButton.isVisible({ timeout: 3000 })) {
        await continueButton.click();
      }

      // Stage 2: Auth0 password page
      await page.locator('#password').waitFor({ timeout: 15000 });
      await page.locator('#password').fill('letmein1');

      const loginSubmit = page.getByRole('button', { name: 'Continue' }).or(
        page.getByRole('button', { name: 'Log In' })
      );
      await loginSubmit.first().waitFor({ state: 'visible', timeout: 10000 });
      await loginSubmit.first().click();

      for (let i = 0; i < 30; i++) {
        if (authCode) break;
        await page.waitForTimeout(1000);
      }

      if (!authCode) {
        console.warn(`  Debug URL: ${page.url()}`);
        await page.screenshot({ path: `/tmp/auth-debug-${retry}.png` });
      }

      await browser.close();

      if (!authCode) {
        console.warn(`Auth attempt ${retry + 1}/${maxRetries}: no auth code captured`);
        continue;
      }

      const tokenResponse = await fetch(`${haAuthority}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code: authCode,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        }).toString(),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.access_token) {
        return `Bearer ${tokenData.access_token}`;
      }

      console.warn(`Auth attempt ${retry + 1}/${maxRetries}: token exchange failed:`, tokenData);
    } catch (error) {
      console.warn(`Auth attempt ${retry + 1}/${maxRetries} failed:`, (error as Error).message);
      if (browser) await browser.close().catch(() => {});
    }
  }

  throw new Error('Failed to retrieve access token after all retries');
}
