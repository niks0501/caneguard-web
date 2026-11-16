import { z } from "zod";

/**
 * Per-viewer memory of when this reviewer last looked at To do. Cases
 * submitted after that moment carry a "new" dot. Browser storage only: there
 * is no server record, so a different browser starts with no dots.
 */

export const TODO_LAST_LOOK_STORAGE_KEY = "caneguard.todo.lastLook";
export const TODO_LAST_LOOK_VERSION = 1;

const storedSchema = z.object({
  version: z.literal(TODO_LAST_LOOK_VERSION),
  viewers: z.record(z.string(), z.number().finite().nonnegative()),
});

type Viewers = Record<string, number>;

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readViewers(storage: Storage | null): Viewers {
  if (!storage) return {};
  try {
    const raw = storage.getItem(TODO_LAST_LOOK_STORAGE_KEY);
    if (!raw) return {};
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.viewers : {};
  } catch {
    // Corrupt or unreadable memory means "no previous look", never a failure.
    return {};
  }
}

/** Epoch ms of this viewer's previous look, or null on a first visit. */
export function readTodoLastLook(
  viewerId: string,
  storage: Storage | null = browserStorage(),
): number | null {
  return readViewers(storage)[viewerId] ?? null;
}

export function saveTodoLastLook(
  viewerId: string,
  at: number = Date.now(),
  storage: Storage | null = browserStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(
      TODO_LAST_LOOK_STORAGE_KEY,
      JSON.stringify({
        version: TODO_LAST_LOOK_VERSION,
        viewers: { ...readViewers(storage), [viewerId]: at },
      }),
    );
  } catch {
    // A full or blocked store leaves To do usable without the dots.
  }
}

/** A first visit has nothing to compare against, so no case is marked new. */
export function isNewSinceLastLook(submittedAt: string, lastLook: number | null) {
  if (lastLook === null) return false;
  const submitted = Date.parse(submittedAt);
  return Number.isFinite(submitted) && submitted > lastLook;
}

/** Whole days since submission. */
export function waitingLabel(submittedAt: string, now: Date = new Date()) {
  const submitted = Date.parse(submittedAt);
  if (!Number.isFinite(submitted)) return null;
  const days = Math.max(0, Math.floor((now.getTime() - submitted) / 86_400_000));
  if (days === 0) return "Waiting today";
  return days === 1 ? "Waiting 1 day" : "Waiting " + days + " days";
}
