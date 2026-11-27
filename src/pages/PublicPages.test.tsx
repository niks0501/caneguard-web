import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appRoutes } from "../app/appRoutes";
import { AuthContext, type AuthContextValue } from "../auth/auth.context";
import type { AuthStatus } from "../auth/auth.types";
import { PUBLIC_THEME_STORAGE_KEY } from "../theme/publicThemePreference";
import { THEME_STORAGE_KEY, applyTheme, setTheme } from "../theme/themePreference";

function authValue(status: AuthStatus): AuthContextValue {
  return {
    status,
    user: null,
    reason: null,
    login: () => Promise.reject(new Error("not used")),
    logout: () => Promise.resolve(),
    restoreSession: () => Promise.resolve(),
  };
}

function renderAt(path: string, status: AuthStatus = "unauthenticated") {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <AuthContext.Provider value={authValue(status)}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );
  return router;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  setTheme("paper");
  applyTheme("paper");
});

describe("public landing page", () => {
  it("shows the landing page to a signed-out visitor at /", async () => {
    const router = renderAt("/");
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Learn the cane. Keep the legacy growing.",
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    const nav = screen.getByRole("banner");
    expect(within(nav).getByRole("link", { name: "Staff sign in" })).toHaveAttribute("href", "/login");
  });

  it("offers a signed-in user a way into the workspace instead", async () => {
    renderAt("/", "authenticated");
    const nav = (await screen.findByRole("banner"));
    expect(within(nav).getByRole("link", { name: "Open workspace" })).toHaveAttribute("href", "/dashboard");
    expect(within(nav).queryByRole("link", { name: "Staff sign in" })).not.toBeInTheDocument();
  });

  it("keeps the workspace behind sign-in", async () => {
    const router = renderAt("/dashboard");
    await screen.findByRole("heading", { name: /sign in/i });
    expect(router.state.location.pathname).toBe("/login");
  });
});

describe("Botanical Glass landing structure", () => {
  it("promotes the guide after the hero and drops section eyebrows", async () => {
    const { container } = render(
      <AuthContext.Provider value={authValue("unauthenticated")}>
        <RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: ["/"] })} />
      </AuthContext.Provider>,
    );
    await screen.findByRole("heading", { level: 1, name: /Learn the cane/ });

    expect(container.querySelectorAll(".eyebrow")).toHaveLength(0);
    const ids = Array.from(container.querySelectorAll(".pub-ambient > section")).map((el) => el.id);
    expect(ids).toEqual(["guide", "what", "growth", "quiz", "history", "legacy", "how", "sources"]);
    expect(screen.getByText("Nasugbu · Batangas · Sugarcane country")).toBeInTheDocument();
    expect(container.querySelector(".pub-nav-wrap > header.pub-nav")).not.toBeNull();
    expect(container.querySelectorAll(".pub-specimen")).toHaveLength(3);
    expect(container.querySelectorAll(".pub-stats .pub-stat")).toHaveLength(4);
    expect(container.querySelectorAll(".pub-flow__badge")).toHaveLength(4);
  });
});

describe("Field Guide routes", () => {
  it("renders an entry without signing in, with symptoms, prevention and management", async () => {
    renderAt("/guide/rust");
    expect(await screen.findByRole("heading", { level: 1, name: "Sugarcane rust" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Symptoms" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Prevention" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Management" })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /rust pustules/i }).length).toBeGreaterThan(0);
  });

  it("shows the not-found page for an unknown entry", async () => {
    renderAt("/guide/banana");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("filters the gallery by category", async () => {
    const user = userEvent.setup();
    renderAt("/guide");
    await screen.findByRole("heading", { name: "Know it before you report it" });
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("link", { name: /Sugarcane|Healthy|Red-Striped/ })).toHaveLength(5);

    await user.click(screen.getByRole("button", { name: "Pest" }));
    expect(within(main).getAllByRole("link", { name: /Red-Striped/ })).toHaveLength(1);
    expect(within(main).queryByRole("link", { name: /Sugarcane rust/ })).not.toBeInTheDocument();
  });

  it("switches the entry photo from the thumbnails", async () => {
    const user = userEvent.setup();
    renderAt("/guide/smut");
    const second = await screen.findByRole("button", {
      name: "Several whips curling over a smut-affected block",
    });
    await user.click(second);
    expect(second).toHaveAttribute("aria-pressed", "true");
  });
});

describe("interactive blocks", () => {
  it("explains a plant part and links the entries to watch for", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(await screen.findByRole("button", { name: "Growing point" }));
    expect(screen.getByText(/spindle at the top/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Smut" })[0]).toHaveAttribute("href", "/guide/smut");
  });

  it("steps through the growth stages", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(await screen.findByRole("button", { name: /3\. Grand growth/ }));
    expect(screen.getByText(/the stage where rust and RSSI/)).toBeInTheDocument();
  });

  it("scores the identification quiz and reveals the answer", async () => {
    const user = userEvent.setup();
    renderAt("/");
    const quiz = (await screen.findByRole("heading", { name: "Which one is it?" })).closest("section")!;
    // The first fixed question is the first Healthy photo.
    await user.click(within(quiz).getByRole("button", { name: "Healthy" }));
    expect(within(quiz).getByText("Correct.")).toBeInTheDocument();
    expect(within(quiz).getByText("1 of 1 correct")).toBeInTheDocument();

    await user.click(within(quiz).getByRole("button", { name: "Next photo" }));
    // The second fixed question is the first Mosaic photo; answer wrongly.
    await user.click(within(quiz).getByRole("button", { name: "Smut" }));
    expect(within(quiz).getByText(/Not quite\. It is Mosaic\./)).toBeInTheDocument();
    expect(within(quiz).getByText("1 of 2 correct")).toBeInTheDocument();
  });
});

describe("public theme", () => {
  it("toggles dark on the public pages without touching the workspace theme", async () => {
    const user = userEvent.setup();
    setTheme("paper");
    const workspaceBefore = window.localStorage.getItem(THEME_STORAGE_KEY);
    renderAt("/");

    await user.click(await screen.findByRole("button", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(PUBLIC_THEME_STORAGE_KEY)).toBe(
      JSON.stringify({ version: 1, theme: "dark" }),
    );
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(workspaceBefore);
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  });

  it("restores the workspace theme when navigating from the public pages to the sign-in page", async () => {
    const user = userEvent.setup();
    setTheme("paper");
    const router = renderAt("/");
    await user.click(await screen.findByRole("button", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(within(screen.getByRole("banner")).getByRole("link", { name: "Staff sign in" }));
    await screen.findByRole("heading", { name: /sign in/i });
    expect(router.state.location.pathname).toBe("/login");
    expect(document.documentElement.dataset.theme).toBe("paper");

    await router.navigate("/");
    await screen.findByRole("heading", { level: 1, name: /Learn the cane/ });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
