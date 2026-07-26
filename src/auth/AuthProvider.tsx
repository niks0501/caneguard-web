import { useCallback, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/ApiError";
import { env } from "../config/env";
import {
  getCurrentUser,
  loginRequest,
  logoutRequest,
  WebRoleError,
} from "./auth.api";
import { AuthContext } from "./auth.context";
import { subscribeToSessionExpiration } from "./authSession";
import type {
  AppUser,
  AuthSnapshot,
  LoginCredentials,
} from "./auth.types";

const mockUser: AppUser = {
  uuid: "00000000-0000-4000-8000-000000000100",
  name: "Maria Santos",
  email: "mao@caneguard.test",
  role: "reviewer",
};

const initialSnapshot: AuthSnapshot = {
  status: "loading",
  user: null,
  reason: null,
};

async function resolveSessionSnapshot(): Promise<AuthSnapshot> {
  if (env.dataSource === "mock") {
    return {
      status: "authenticated",
      user: mockUser,
      reason: null,
    };
  }

  try {
    const user = await getCurrentUser();
    return { status: "authenticated", user, reason: null };
  } catch (error) {
    if (error instanceof WebRoleError) {
      return {
        status: "unauthenticated",
        user: null,
        reason: "access_denied",
      };
    }
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      return {
        status: "unauthenticated",
        user: null,
        reason: error.status === 403 ? "access_denied" : null,
      };
    }
    return { status: "service_error", user: null, reason: null };
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(initialSnapshot);

  const restoreSession = useCallback(async () => {
    setSnapshot(await resolveSessionSnapshot());
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToSessionExpiration(() => {
      queryClient.clear();
      setSnapshot((current) => {
        if (current.status !== "authenticated") return current;
        return {
          status: "unauthenticated",
          user: null,
          reason: "session_expired",
        };
      });
    });
    void resolveSessionSnapshot().then(setSnapshot);

    return unsubscribe;
  }, [queryClient]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    if (env.dataSource === "mock") {
      setSnapshot({
        status: "authenticated",
        user: mockUser,
        reason: null,
      });
      return mockUser;
    }

    await loginRequest(credentials);
    const user = await getCurrentUser();
    setSnapshot({ status: "authenticated", user, reason: null });
    return user;
  }, []);

  const logout = useCallback(async () => {
    if (env.dataSource === "mock") {
      queryClient.clear();
      setSnapshot({
        status: "unauthenticated",
        user: null,
        reason: null,
      });
      return;
    }

    try {
      await logoutRequest();
      queryClient.clear();
      setSnapshot({
        status: "unauthenticated",
        user: null,
        reason: null,
      });
    } catch (error) {
      queryClient.clear();
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 419)
      ) {
        setSnapshot({
          status: "unauthenticated",
          user: null,
          reason: "session_expired",
        });
        return;
      }
      setSnapshot((current) => ({
        status: "service_error",
        user: current.user,
        reason: null,
      }));
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({
      ...snapshot,
      login,
      logout,
      restoreSession,
    }),
    [login, logout, restoreSession, snapshot],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
