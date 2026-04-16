import { chromium, type BrowserContext, type Page } from 'playwright';
import type { EnvConfig } from '../types.js';
import { loginThroughHaOAuth } from '../api/auth.js';

/** Member home after HA login (e.g. https://www.dev.carezen.net/app/mhp). */
export const SEEKER_POST_LOGIN_PATH = '/app/mhp';

/**
 * Inbox deep link for a job-application thread, e.g.
 * {@code https://www.dev.carezen.net/app/messages?cid=messaging:!members-…}
 */
export function seekerMessagesAppUrl(baseUrl: string, messageCid: string): string {
  const u = new URL(baseUrl);
  u.pathname = '/app/messages';
  u.searchParams.set('cid', messageCid.trim());
  return u.toString();
}

export interface SeekerWebLoginOptions {
  email: string;
  /**
   * Tried in order until login + post-login navigation succeed (same browser tab; session cleared between tries).
   * Default from CLI: {@code ['letmein1', 'Letmein1']}.
   */
  passwords: string[];
  envConfig: EnvConfig;
  /** Close browser after navigation (default false — keep open for manual testing). */
  autoClose: boolean;
  /**
   * When set (full {@code messaging:!members-…} value), after login open
   * {@code /app/messages?cid=…}. Otherwise {@link SEEKER_POST_LOGIN_PATH}.
   */
  messageCid?: string;
}

async function clearSessionForPasswordRetry(context: BrowserContext, page: Page): Promise<void> {
  await context.clearCookies();
  try {
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore cross-origin */
      }
    });
  } catch {
    /* ignore */
  }
  await page.goto('about:blank');
}

/**
 * Opens a visible Chromium window (same incognito pattern as web enrollment when no Chrome extension is used),
 * completes HA/Auth0 login, then navigates to member home or job applicants/messages.
 */
export async function runSeekerWebLogin(opts: SeekerWebLoginOptions): Promise<void> {
  const browser = await chromium.launch({
    headless: false,
    args: ['--incognito'],
  });

  const context = await browser.newContext();
  const workPage = await context.newPage();
  workPage.setDefaultTimeout(30_000);

  let lastErr: Error | undefined;
  let page: Page | undefined;
  let winningPassword: string | undefined;

  const messageCid =
    opts.messageCid && opts.messageCid.trim().length > 0 ? opts.messageCid.trim() : undefined;

  for (let i = 0; i < opts.passwords.length; i++) {
    const pw = opts.passwords[i];
    const attemptLabel = `${i + 1}/${opts.passwords.length}`;

    try {
      console.log(`  Login attempt ${attemptLabel}…`);
      await loginThroughHaOAuth(workPage, opts.email, pw, opts.envConfig);

      const afterLoginUrl = messageCid
        ? seekerMessagesAppUrl(opts.envConfig.baseUrl, messageCid)
        : `${opts.envConfig.baseUrl}${SEEKER_POST_LOGIN_PATH}`;
      await workPage.goto(afterLoginUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });

      page = workPage;
      winningPassword = pw;
      break;
    } catch (err) {
      lastErr = err as Error;
      console.warn(`  Attempt ${attemptLabel} failed: ${lastErr.message}`);
      if (i < opts.passwords.length - 1) {
        console.log('  Clearing session and retrying on the same browser window…');
        await clearSessionForPasswordRetry(context, workPage);
      }
    }
  }

  if (!page || winningPassword === undefined) {
    console.error(
      `\n✗ Seeker web login failed after ${opts.passwords.length} password attempt(s).`,
    );
    if (lastErr) {
      console.error(`  Last error: ${lastErr.message}`);
    }
    await browser.close();
    process.exit(1);
  }

  console.log('\n✓ Signed in to the web app.');
  console.log(`  Email:      ${opts.email}`);
  console.log(`  Password:   ${winningPassword}`);
  console.log(
    `  Opened:     ${messageCid ? 'messages (/app/messages?cid=…)' : 'member home (/app/mhp)'}`,
  );
  console.log(`  Start URL:  ${page.url()}`);

  if (opts.autoClose) {
    await browser.close();
    return;
  }

  console.log('\n  Browser stays open — close it when finished.\n');
  await new Promise<void>((resolve) => {
    browser.once('disconnected', () => resolve());
  });
}
