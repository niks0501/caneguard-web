import { z } from "zod";
import { axiosClient } from "../api/axiosClient";
import { env } from "../config/env";

export interface MobileDevice {
  id: number;
  deviceId: string | null;
  deviceName: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isCurrent: boolean;
}

export interface ChangePasswordInput {
  currentPassword: string;
  password: string;
  passwordConfirmation: string;
}

export interface ChangeEmailInput {
  currentPassword: string;
  email: string;
}

const mobileDeviceDtoSchema = z.object({
  id: z.number(),
  device_id: z.string().nullable().optional(),
  device_name: z.string(),
  created_at: z.string().nullable().optional(),
  last_used_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  is_current: z.boolean().optional(),
});

const mobileDevicesResponseSchema = z.object({
  data: z.array(mobileDeviceDtoSchema),
  meta: z
    .object({
      count: z.number().optional(),
    })
    .optional(),
});

let mockDevices: MobileDevice[] = [
  {
    id: 1,
    deviceId: "samsung-sm-g991b-01",
    deviceName: "Samsung Galaxy S21 (Field device)",
    createdAt: "2026-06-15T09:30:00.000Z",
    lastUsedAt: "2026-07-21T14:15:00.000Z",
    expiresAt: null,
    isCurrent: false,
  },
  {
    id: 2,
    deviceId: "xiaomi-2201116sg-02",
    deviceName: "Redmi Note 11 (Inspection team)",
    createdAt: "2026-07-01T11:00:00.000Z",
    lastUsedAt: "2026-07-20T08:45:00.000Z",
    expiresAt: null,
    isCurrent: false,
  },
];

export async function changePassword(
  input: ChangePasswordInput,
): Promise<{ message: string }> {
  if (env.dataSource === "mock") {
    if (!input.currentPassword) {
      throw new Error("The current password is required.");
    }
    if (input.password.length < 8) {
      throw new Error("The password must be at least 8 characters.");
    }
    if (input.password !== input.passwordConfirmation) {
      throw new Error("The password confirmation does not match.");
    }
    return { message: "Password updated. Sign in again with the new password." };
  }

  const response = await axiosClient.post("/api/v1/auth/password", {
    current_password: input.currentPassword,
    password: input.password,
    password_confirmation: input.passwordConfirmation,
  });
  return response.data;
}

export async function changeEmail(
  input: ChangeEmailInput,
): Promise<{ message: string }> {
  if (env.dataSource === "mock") {
    if (!input.currentPassword) {
      throw new Error("The current password is required.");
    }
    if (!input.email || !input.email.includes("@")) {
      throw new Error("A valid email address is required.");
    }
    return { message: "Email updated. Verify the new address before signing in." };
  }

  const response = await axiosClient.patch("/api/v1/auth/email", {
    current_password: input.currentPassword,
    email: input.email,
  });
  return response.data;
}

export async function listMobileDevices(): Promise<MobileDevice[]> {
  if (env.dataSource === "mock") {
    return [...mockDevices];
  }

  const response = await axiosClient.get("/api/v1/auth/devices");
  const parsed = mobileDevicesResponseSchema.parse(response.data);
  return parsed.data.map((dto) => ({
    id: dto.id,
    deviceId: dto.device_id ?? null,
    deviceName: dto.device_name,
    createdAt: dto.created_at ?? null,
    lastUsedAt: dto.last_used_at ?? null,
    expiresAt: dto.expires_at ?? null,
    isCurrent: Boolean(dto.is_current),
  }));
}

export async function revokeMobileDevice(id: number): Promise<{ message: string }> {
  if (env.dataSource === "mock") {
    mockDevices = mockDevices.filter((d) => d.id !== id);
    return { message: "Device revoked successfully." };
  }

  const response = await axiosClient.delete(`/api/v1/auth/devices/${id}`);
  return response.data;
}
