import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeChoice } from "./ThemeChoice";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getTheme,
  readThemePreference,
  setTheme,
} from "./themePreference";

afterEach(() => {
  // A chosen theme outlives a render, so return the store to paper.
  setTheme("paper");
  applyTheme("paper");
  window.localStorage.clear();
});

describe("ThemeChoice", () => {
  it("offers the paper and dark appearance options on the settings surface", () => {
    render(<ThemeChoice />);

    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Paper" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeChecked();
    expect(
      screen.getByText("Printing always uses the paper theme."),
    ).toBeInTheDocument();
  });

  it("switches the workspace to dark, remembers it, and can switch back", async () => {
    const user = userEvent.setup();
    render(<ThemeChoice />);

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(getTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(readThemePreference()).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(JSON.parse(window.localStorage.getItem(THEME_STORAGE_KEY) as string)).toEqual({
      version: 1,
      theme: "dark",
    });

    await user.click(screen.getByRole("radio", { name: "Paper" }));

    expect(getTheme()).toBe("paper");
    expect(document.documentElement.dataset.theme).toBe("paper");
    expect(screen.getByRole("radio", { name: "Paper" })).toBeChecked();
  });
});
