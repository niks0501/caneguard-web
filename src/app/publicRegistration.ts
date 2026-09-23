export function isPublicRegistrationEnabled(): boolean {
  return import.meta.env.VITE_CANEGUARD_SELF_REGISTRATION_ENABLED === "true";
}
