export interface UserProfile {
  id: string | null;
  name: string | null;
}

export interface SessionData {
  session: string;
  sesskey: string | null;
  baseUrl: string;
  user: UserProfile | null;
  updatedAt: string;
}

export interface SessionStatus {
  authenticated: boolean;
  message?: string;
  user?: UserProfile | null;
  sesskey?: string | null;
  updatedAt?: string;
}
