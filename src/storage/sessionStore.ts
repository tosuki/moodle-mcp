import fs from 'fs';
import { SESSION_DIR, SESSION_FILE } from '../config/constants';
import { SessionData } from '../types/session';

export class SessionStore {
  public static save(data: Omit<SessionData, 'updatedAt'> & { updatedAt?: string }): SessionData {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
    }

    const payload: SessionData = {
      session: data.session,
      sesskey: data.sesskey,
      baseUrl: data.baseUrl,
      user: data.user,
      updatedAt: data.updatedAt || new Date().toISOString(),
    };

    fs.writeFileSync(SESSION_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
    return payload;
  }

  public static load(): SessionData | null {
    if (!fs.existsSync(SESSION_FILE)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
      return JSON.parse(raw) as SessionData;
    } catch {
      return null;
    }
  }

  public static clear(): void {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
  }

  public static exists(): boolean {
    return fs.existsSync(SESSION_FILE);
  }
}
