import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { ApiError } from "../../api/ApiError";
import {
  duplicateLinkBlockedMessage,
  duplicateLinkErrorMessage,
  duplicateUnlinkErrorMessage,
} from "./duplicateLinkMessages";

describe("duplicate link messages", () => {
  it("explains an upfront block in one line, with the review lock first", () => {
    expect(duplicateLinkBlockedMessage(null, false)).toBeNull();
    expect(duplicateLinkBlockedMessage("closed", false)).toMatch(/closed/);
    expect(duplicateLinkBlockedMessage("visit_completed", false)).toMatch(/field visit is completed/);
    expect(duplicateLinkBlockedMessage("closed", true)).toMatch(/Another reviewer/);
  });

  it("maps every documented link failure to a plain message", () => {
    expect(duplicateLinkErrorMessage(null)).toBeNull();
    expect(duplicateLinkErrorMessage(new ApiError("x", { status: 409 }))).toMatch(/different original case/);
    expect(duplicateLinkErrorMessage(new ApiError("x", { status: 423 }))).toMatch(/cannot be closed right now/);
    expect(duplicateLinkErrorMessage(new ApiError("x", { status: 403 }))).toMatch(/permission/);
    expect(duplicateLinkErrorMessage(new ApiError("x", { status: 422, errors: { field_validation_state: ["Completed."] } }))).toMatch(/field visit is completed/);
    expect(duplicateLinkErrorMessage(new ApiError("x", { status: 422, errors: { report: ["Server words."] } }))).toBe("Server words.");
    expect(duplicateLinkErrorMessage(new ApiError("x", { status: 500 }))).toMatch(/service is unavailable/);
    expect(duplicateLinkErrorMessage(new ZodError([]))).toMatch(/unexpected response/);
    expect(duplicateLinkErrorMessage(new Error("offline"))).toMatch(/service is unavailable/);
  });

  it("never shows jargon or a raw ID in any message", () => {
    const messages = [409, 422, 423, 403, 500].map((status) =>
      duplicateLinkErrorMessage(new ApiError("x", { status })) ?? "");
    for (const message of messages) expect(message).not.toMatch(/canonical|uuid/i);
  });

  it("maps unlink failures", () => {
    expect(duplicateUnlinkErrorMessage(undefined)).toBeNull();
    expect(duplicateUnlinkErrorMessage(new ApiError("x", { status: 409 }))).toMatch(/changed/);
    expect(duplicateUnlinkErrorMessage(new ApiError("x", { status: 422 }))).toMatch(/closed or its field visit is completed/);
    expect(duplicateUnlinkErrorMessage(new ApiError("x", { status: 403 }))).toMatch(/permission/);
    expect(duplicateUnlinkErrorMessage(new ApiError("x", { status: 500 }))).toMatch(/unavailable/);
  });
});
