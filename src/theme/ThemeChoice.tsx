import { setTheme, type Theme } from "./themePreference";
import { useTheme } from "./useTheme";

/**
 * The Settings dark choice (QF-11).
 *
 * Two options, native radios in the same quiet pill shape as the dashboard
 * scope ruler. Choosing one repaints the workspace at once and is remembered
 * for the next visit; the note states the one consequence an operator cannot
 * see from here, which is that printing stays on paper.
 */
const options: Array<{ value: Theme; label: string }> = [
  { value: "paper", label: "Paper" },
  { value: "dark", label: "Dark" },
];

export function ThemeChoice() {
  const theme = useTheme();
  return (
    <fieldset className="theme-choice">
      <legend>Theme</legend>
      <div
        className="theme-choice__options"
        role="radiogroup"
        aria-label="Theme"
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={
              theme === option.value
                ? "theme-choice__option theme-choice__option--active"
                : "theme-choice__option"
            }
          >
            <input
              type="radio"
              name="appearance-theme"
              value={option.value}
              checked={theme === option.value}
              onChange={() => setTheme(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <p className="theme-choice__note">Printing always uses the paper theme.</p>
    </fieldset>
  );
}
