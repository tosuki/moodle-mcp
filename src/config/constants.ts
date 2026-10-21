import path from 'path';
import os from 'os';

export const DEFAULT_BASE_URL = 'https://ead.domhelder.edu.br';
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const SESSION_DIR = path.join(os.homedir(), '.moodle');
export const SESSION_FILE = path.join(SESSION_DIR, 'session.json');

export const DEFAULT_LOGIN_TIMEOUT_MS = 180_000;
export const DEFAULT_POLL_INTERVAL_MS = 1_000;
