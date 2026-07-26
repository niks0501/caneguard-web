import { z } from "zod";
import { axiosClient } from "../api/axiosClient";
import type { AppUser, LoginCredentials, WebRole } from "./auth.types";

const userResponseSchema = z.object({
  data: z.object({
    uuid: z.string(),
    name: z.string(),
    email: z.email(),
    role: z.enum(["field_reporter", "reviewer", "admin"]),
  }),
});

export async function initializeCsrf(): Promise<void> {
  await axiosClient.get("/sanctum/csrf-cookie");
}

export async function loginRequest(
  credentials: LoginCredentials,
): Promise<void> {
  await initializeCsrf();
  await axiosClient.post("/login", credentials);
}

export async function getCurrentUser(): Promise<AppUser> {
  const response = await axiosClient.get("/api/v1/me");
  const user = userResponseSchema.parse(response.data).data;
  const role = user.role;

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
