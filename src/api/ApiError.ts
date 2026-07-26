import axios from "axios";
import { z } from "zod";

const errorPayloadSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly errors?: Record<string, string[]>;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      errors?: Record<string, string[]>;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.errors = options.errors;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const payload = errorPayloadSchema.safeParse(error.response?.data);
    return new ApiError(
      payload.success ? payload.data.message : error.message || "The request failed.",
      {
        status: error.response?.status,
        code: payload.success ? payload.data.code : undefined,
        errors: payload.success ? payload.data.errors : undefined,
        cause: error,
      },
    );
  }

  return new ApiError(
    error instanceof Error ? error.message : "An unexpected request error occurred.",
    { cause: error },
  );
}
