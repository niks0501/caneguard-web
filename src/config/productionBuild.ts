/** Validate build inputs before Vite embeds them; never print input values. */
export function validateProductionBuild(source: Record<string, unknown>): void {
  let url: URL;
  try {
    if (typeof source.VITE_API_BASE_URL !== "string" || !source.VITE_API_BASE_URL.trim()) throw new Error();
    url = new URL(source.VITE_API_BASE_URL);
  } catch {
    throw new Error("Production build requires VITE_API_BASE_URL as a public HTTPS origin.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" || url.username || url.password ||
    url.pathname !== "/" || url.search || url.hash ||
    !host.includes(".") || host.includes("*") || host === "localhost" || host.endsWith(".localhost") ||
    host.endsWith(".local") || host.endsWith(".internal") ||
    host === "0.0.0.0" || host.startsWith("127.") ||
    host.startsWith("10.") || host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.startsWith("[")
  ) {
    throw new Error("Production VITE_API_BASE_URL must be a public HTTPS origin without credentials, path, query or fragment.");
  }
  if (source.VITE_DATA_SOURCE !== "api") {
    throw new Error("Production build requires VITE_DATA_SOURCE=api; mock data is not deployable.");
  }
  if (source.VITE_REALTIME_ENABLED !== "false") {
    throw new Error("Production build requires VITE_REALTIME_ENABLED=false until realtime is separately provisioned.");
  }
}
