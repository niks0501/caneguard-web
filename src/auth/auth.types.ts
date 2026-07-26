export type WebRole = "reviewer" | "admin";

export interface AppUser {
  uuid: string;
  name: string;
  email: string;
  role: WebRole;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "service_error";

export type AuthReason =
  | "session_expired"
  | "access_denied"
  | null;

export interface AuthSnapshot {
  status: AuthStatus;
  user: AppUser | null;
  reason: AuthReason;
}
