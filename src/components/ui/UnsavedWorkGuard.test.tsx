import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Link, Outlet, RouterProvider, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { UnsavedWorkProvider } from "./UnsavedWorkGuard";
import { useUnsavedWorkGuard } from "./unsavedWorkContext";

function DraftForm() {
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = note.trim().length > 0 && !saved;
  useUnsavedWorkGuard(dirty);
  const location = useLocation();

  return (
    <form aria-label="Draft form">
      <p>At {location.pathname}</p>
      <input
        aria-label="Note"
        value={note}
        onChange={(event) => { setNote(event.target.value); setSaved(false); }}
      />
      <Link to="/next">Leave the case</Link>
      <button type="button" onClick={() => setSaved(true)}>Save draft</button>
    </form>
  );
}

function renderGuard(start = "/case") {
  const router = createMemoryRouter(
    [
      {
        element: (
          <UnsavedWorkProvider>
            <Outlet />
          </UnsavedWorkProvider>
        ),
        children: [
          { path: "/case", element: <DraftForm /> },
          { path: "/next", element: <p>Next workspace</p> },
        ],
      },
    ],
    { initialEntries: [start] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("unsaved work guard", () => {
  it("blocks leaving a dirty draft and keeps the draft when the reviewer stays", async () => {
    const user = userEvent.setup();
    const router = renderGuard();

    await user.type(screen.getByRole("textbox", { name: "Note" }), "Aphid outbreak confirmed");
    await user.click(screen.getByRole("link", { name: "Leave the case" }));

    const dialog = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
    expect(screen.getByRole("button", { name: "Stay on this page" })).toHaveFocus();

    await user.click(within(dialog).getByRole("button", { name: "Stay on this page" }));

    expect(router.state.location.pathname).toBe("/case");
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Aphid outbreak confirmed");
  });

  it("discards once without a server write and does not resurrect the draft", async () => {
    const user = userEvent.setup();
    const router = renderGuard();

    await user.type(screen.getByRole("textbox", { name: "Note" }), "Draft wording");
    await user.click(screen.getByRole("link", { name: "Leave the case" }));

    const dialog = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Discard and leave" }));

    expect(await screen.findByText("Next workspace")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/next");

    await router.navigate(-1);
    expect(await screen.findByRole("textbox", { name: "Note" })).toHaveValue("");
  });

  it("lets a clean form leave freely and below a saved draft", async () => {
    const user = userEvent.setup();
    const router = renderGuard();

    await user.type(screen.getByRole("textbox", { name: "Note" }), "Saved wording");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await user.click(screen.getByRole("link", { name: "Leave the case" }));

    expect(await screen.findByText("Next workspace")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/next");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("blocks switching between records that only change the query string", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          element: (
            <UnsavedWorkProvider>
              <Outlet />
            </UnsavedWorkProvider>
          ),
          children: [
            { path: "/case", element: <DraftForm /> },
            { path: "/next", element: <p>Next workspace</p> },
          ],
        },
      ],
      { initialEntries: ["/case?report=one"] },
    );
    render(<RouterProvider router={router} />);

    await user.type(screen.getByRole("textbox", { name: "Note" }), "Assigning this visit");
    await router.navigate("/case?report=two");

    expect(await screen.findByRole("dialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    expect(router.state.location.search).toBe("?report=one");
  });

  it("blocks browser Back while the draft is dirty", async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          element: (
            <UnsavedWorkProvider>
              <Outlet />
            </UnsavedWorkProvider>
          ),
          children: [
            { path: "/start", element: <p>Queue workspace</p> },
            { path: "/case", element: <DraftForm /> },
          ],
        },
      ],
      { initialEntries: ["/start", "/case"] },
    );
    render(<RouterProvider router={router} />);

    await user.type(screen.getByRole("textbox", { name: "Note" }), "Unsubmitted finding");
    await router.navigate(-1);

    expect(await screen.findByRole("dialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/case");
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Unsubmitted finding");
  });
});
