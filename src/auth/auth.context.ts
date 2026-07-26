import { createContext } from "react";
import type {
  AppUser,
  AuthSnapshot,
  LoginCredentials,
} from "./auth.types";

export interface AuthContextValue extends AuthSnapshot {
  login: (credentials: LoginCredentials) => Promise<AppUser>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
