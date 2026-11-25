import { setPublicTheme } from "../../theme/publicThemePreference";
import type { Theme } from "../../theme/themePreference";
import { usePublicTheme } from "../../theme/usePublicTheme";

const options: Array<{ value: Theme; label: string }> = [
  { value: "paper", label: "Paper" },
  { value: "dark", label: "Dark" },
];

/**
 * The public pages' theme switch. It only ever writes the public store, so a
 * choice made here never changes the signed-in workspace theme.
 */
export function PublicThemeToggle() {
  const theme = usePublicTheme();
  return (
    <div className="pub-theme" role="group" aria-label="Page theme">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="pub-theme__option"
          aria-pressed={theme === option.value}
          onClick={() => setPublicTheme(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
