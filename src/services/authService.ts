import { chromium } from 'playwright';
import { SessionStore } from '../storage/sessionStore';
import { DEFAULT_BASE_URL, DEFAULT_LOGIN_TIMEOUT_MS, DEFAULT_POLL_INTERVAL_MS } from '../config/constants';
import { UserProfile } from '../types/session';

export interface InteractiveLoginOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export interface InteractiveLoginResult {
  success: boolean;
  message: string;
  user: UserProfile | null;
}

export class AuthService {
  public static async performInteractiveLogin(options: InteractiveLoginOptions = {}): Promise<InteractiveLoginResult> {
    const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    const timeoutMs = options.timeoutMs || DEFAULT_LOGIN_TIMEOUT_MS;

    console.error('[AuthService] Launching headful browser for interactive SSO authentication...');

    const browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized'],
    });

    const context = await browser.newContext({
      viewport: null,
    });

    const page = await context.newPage();

    try {
      await page.goto(`${baseUrl}/auth/oidc/`, { waitUntil: 'domcontentloaded' });
      console.error('[AuthService] Awaiting user login completion (Microsoft Teams / Azure AD / 2FA)...');

      const startTime = Date.now();
      let capturedSession: {
        session: string;
        sesskey: string | null;
        user: UserProfile | null;
      } | null = null;

      while (Date.now() - startTime < timeoutMs) {
        const currentUrl = page.url();

        if (currentUrl.includes('/my/') || currentUrl.includes('/course/')) {
          const cookies = await context.cookies(baseUrl);
          const moodleCookie = cookies.find((c) => c.name === 'MoodleSession');

          if (moodleCookie) {
            const extracted = await page.evaluate(() => {
              const anyWin = window as unknown as { M?: { cfg?: { sesskey?: string } } };
              const sesskey = anyWin.M?.cfg?.sesskey || null;
              const profileLink = document.querySelector<HTMLAnchorElement>('a[href*="/user/profile.php"]');
              const name = profileLink ? profileLink.innerText.trim() : null;
              const id = profileLink ? profileLink.href.split('id=')[1]?.split('&')[0] : null;
              return { sesskey, name, id };
            }).catch(() => ({ sesskey: null, name: null, id: null }));

            capturedSession = {
              session: moodleCookie.value,
              sesskey: extracted.sesskey,
              user: {
                name: extracted.name,
                id: extracted.id,
              },
            };
            break;
          }
        }

        await page.waitForTimeout(DEFAULT_POLL_INTERVAL_MS);
      }

      if (!capturedSession) {
        throw new Error('Interactive login timed out before session capture.');
      }

      SessionStore.save({
        session: capturedSession.session,
        sesskey: capturedSession.sesskey,
        baseUrl,
        user: capturedSession.user,
      });

      console.error(`[AuthService] Login successful for user: ${capturedSession.user?.name ?? 'Student'}`);

      return {
        success: true,
        message: `Successfully authenticated as ${capturedSession.user?.name ?? 'Unknown user'}`,
        user: capturedSession.user,
      };
    } finally {
      await browser.close().catch(() => {});
    }
  }
}
