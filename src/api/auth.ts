import { chromium } from 'playwright';
import crypto from 'crypto';
import type { EnvConfig } from '../types.js';
import type { ApiClient } from './client.js';

/**
 * Login via the HA (Hydra) proxy in a headless browser and extract session
 * cookies. The proxy handles the Auth0 token exchange server-side and stores
 * the resulting tokens in httpOnly cookies. Passing those cookies with
 * subsequent requests authenticates them at the API gateway level.
 */
async function getSessionCookies(
  email: string,
  envConfig: EnvConfig
): Promise<string> {
  const { baseUrl } = envConfig;
  const haAuthority = `${baseUrl}/api/id-oidc-proxy/ha`;
  const redirectUri = `${baseUrl}/app/id-oidc-client/signin-callback.html`;

  const challenge = crypto
    .createHash('sha256')
    .update(crypto.randomBytes(32).toString('base64url'))
    .digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = new URL(`${haAuthority}/oauth2/authorize`);
  authUrl.searchParams.set('client_id', 'oidc-proxy');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid offline profile email');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(authUrl.toString(), {
      waitUntil: 'networkidle',
      timeout: 45_000,
    });

    // Stage 1: Hydra custom login page — enter email
    const emailInput = page
      .locator('input[type="email"], input[name="email"], #username, #emailId')
      .first();
    await emailInput.waitFor({ timeout: 15_000 });
    await emailInput.fill(email);

    const continueButton = page.getByRole('button', {
      name: 'Continue',
      exact: true,
    });
    if (await continueButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await continueButton.click();
      // Wait for navigation to Auth0 login page
      await page.waitForURL((url) => url.hostname.includes('login'), {
        timeout: 20_000,
      });
    }

    // Stage 2: Auth0 password page
    await page.locator('#password').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('#password').fill('letmein1');

    const loginSubmit = page
      .getByRole('button', { name: 'Continue' })
      .or(page.getByRole('button', { name: 'Log In' }));
    await loginSubmit.first().waitFor({ state: 'visible', timeout: 10_000 });
    await loginSubmit.first().click();

    // Wait for the redirect back to the callback page
    await page.waitForURL(
      (url) => url.pathname.includes('signin-callback'),
      { timeout: 30_000 },
    );
    await page.waitForTimeout(1_500);

    // Extract all cookies for the carezen domain
    const cookies = await context.cookies();
    const cookieHeader = cookies
      .filter((c) => c.domain.includes('carezen'))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

    if (!cookieHeader) {
      throw new Error('Login succeeded but no session cookies were set');
    }

    return cookieHeader;
  } finally {
    await browser.close();
  }
}

/**
 * Authenticate the API client for GraphQL calls.
 *
 * On environments where the OIDC proxy manages tokens via cookies (stg),
 * we log in through a headless browser and extract session cookies.
 * The cookies are then sent with every GraphQL request.
 */
export async function authenticateClient(
  email: string,
  envConfig: EnvConfig,
  client: ApiClient
): Promise<void> {
  const maxRetries = 3;

  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      const cookies = await getSessionCookies(email, envConfig);
      client.setSessionCookies(cookies);
      return;
    } catch (error) {
      console.warn(
        `Auth attempt ${retry + 1}/${maxRetries} failed:`,
        (error as Error).message,
      );
    }
  }

  throw new Error('Failed to authenticate after all retries');
}
