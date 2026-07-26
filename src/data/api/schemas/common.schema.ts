import { z } from "zod";

export const userSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  email: z.email().optional(),
});

export const paginationMetaSchema = z.object({
  current_page: z.number().int().positive(),
  from: z.number().int().positive().nullable(),
  last_page: z.number().int().positive(),
  per_page: z.number().int().positive(),
  to: z.number().int().positive().nullable(),
  total: z.number().int().nonnegative(),
});

export const paginationLinksSchema = z.object({
  first: z.string().nullable(),
  last: z.string().nullable(),
  prev: z.string().nullable(),
  next: z.string().nullable(),
});
