import { routes } from "../../app/routes";

export interface SettingsSection {
  id: string;
  label: string;
  group: "Account" | "Workspace";
  path: string;
  adminOnly: boolean;
}

const section = (
  id: string,
  label: string,
  group: SettingsSection["group"],
): SettingsSection => ({
  id,
  label,
  group,
  path: routes.settingsSection(id),
  adminOnly: group === "Workspace",
});

/** Every Settings page, in rail order. Workspace pages are admin-only. */
export const settingsSections: SettingsSection[] = [
  section("profile", "Profile", "Account"),
  section("appearance", "Appearance", "Account"),
  section("password", "Password", "Account"),
  section("email", "Email address", "Account"),
  section("devices", "Mobile devices", "Account"),
  section("weekly-reporting", "Weekly reporting", "Workspace"),
  section("aerial-analysis", "Aerial canopy check", "Workspace"),
];
