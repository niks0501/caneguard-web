/**
 * Staff-facing recovery copy. Office users cannot start an API server or edit
 * a build variable, so the primary message gives them a next step instead. The
 * developer detail stays available, collapsed, for whoever supports them.
 */
export const serviceUnreachableMessage =
  "CaneGuard cannot be reached right now. Check your connection, then try again. If it keeps failing, contact your office administrator.";

export const serviceUnreachableWhileShowingData =
  "CaneGuard cannot be reached right now. Check your connection, then retry; the last loaded data stays visible and may be stale. If it keeps failing, contact your office administrator.";

export function apiEndpointDetail(apiBaseUrl: string) {
  return `This browser sends requests to ${apiBaseUrl}. A developer or administrator can confirm that address and the API service.`;
}
