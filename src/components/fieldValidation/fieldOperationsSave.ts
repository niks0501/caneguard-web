import { ApiError } from "../../api/ApiError";

export function saveErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 403) {
    return "Your account is not authorized to change this assignment. Nothing was saved.";
  }
  if (error instanceof ApiError && error.status === 409) {
    return "This visit changed since it was loaded. Refresh to see the current assignment; your draft is preserved below.";
  }
  if (error instanceof ApiError && (error.status === 422 || error.status === 404)) {
    return "The selected inspector or target date was rejected. Choose a valid inspector and try again; your draft is preserved.";
  }
  return "The visit could not be saved. Your draft is preserved so you can retry.";
}
