import { z } from "zod";
import { axiosClient } from "../api/axiosClient";
import { ApiError } from "../api/ApiError";
import type {
  AppUser,
  LoginCredentials,
  PasswordResetCredentials,
  WebRole,
} from "./auth.types";

const userResponseSchema = z.object({
  data: z.object({
    uuid: z.string(),
    name: z.string(),
    email: z.email(),
    role: z.enum(["farmer", "field_reporter", "reviewer", "admin"]),
    is_active: z.boolean().default(true),
  }),
});

const authActionResponseSchema = z.object({
  message: z.string(),
  code: z.string(),
});

export async function initializeCsrf(): Promise<void> {
  await axiosClient.get("/sanctum/csrf-cookie");
}

export async function loginRequest(
  credentials: LoginCredentials,
): Promise<void> {
  await initializeCsrf();
  try {
    await axiosClient.post("/login", credentials);
  } catch (error) {
    // An expired CSRF token (419) is recoverable: refresh it once and retry.
    if (!(error instanceof ApiError) || error.status !== 419) {
      throw error;
    }
    await initializeCsrf();
    await axiosClient.post("/login", credentials);
  }
}

export async function resendVerificationRequest(email: string) {
  await initializeCsrf();
  const response = await axiosClient.post("/email/verification-notification", {
    email,
  });
  return authActionResponseSchema.parse(response.data);
}

export async function verifyEmailRequest(
  id: string,
  hash: string,
  params: { expires: string; signature: string },
) {
  const response = await axiosClient.get(
    `/email/verify/${encodeURIComponent(id)}/${encodeURIComponent(hash)}`,
    { params },
  );
  return authActionResponseSchema.parse(response.data);
}

export async function forgotPasswordRequest(email: string) {
  await initializeCsrf();
  const response = await axiosClient.post("/forgot-password", { email });
  return authActionResponseSchema.parse(response.data);
}

export async function resetPasswordRequest(
  credentials: PasswordResetCredentials,
) {
  await initializeCsrf();
  const response = await axiosClient.post("/reset-password", credentials);
  return authActionResponseSchema.parse(response.data);
}

export async function getCurrentUser(): Promise<AppUser> {
  const response = await axiosClient.get("/api/v1/me");
  const user = userResponseSchema.parse(response.data).data;
  const role = user.role;

  if (!user.is_active) {
    throw new ApiError("Account disabled — contact your administrator.", { status: 401, code: "ACCOUNT_DISABLED" });
  }

  if (!isWebRole(role)) {
    throw new WebRoleError();
  }

  return { ...user, role };
}

export async function logoutRequest(): Promise<void> {
  await axiosClient.post("/logout");
}

function isWebRole(role: string): role is WebRole {
  return role === "reviewer" || role === "admin";
}

export class WebRoleError extends Error {
  constructor() {
    super("This account cannot access the web workspace.");
    this.name = "WebRoleError";
  }
}
