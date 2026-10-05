export type WebRole = "reviewer" | "admin";

export interface AppUser {
  uuid: string;
  name: string;
  email: string;
  role: WebRole;
  capabilities?: string[];
  accounts_enabled?: boolean;
  district_id?: number | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegistrationCredentials {
  name: string;
  email: string;
  password: string;
  password_confirmation?: string;
}

export interface PasswordResetCredentials {
  email: string;
  token: string;
  password: string;
  password_confirmation?: string;
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
