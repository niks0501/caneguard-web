import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/ApiError";
import type { Advisory } from "../../domain/report.types";
import { useAdvisories } from "../../hooks/useReports";
import { reportsRepository } from "../../services/reports.service";
import { AdvisoryPicker } from "./AdvisoryPicker";
import { filterAdvisories, findSimilarAdvisory } from "./advisoryLibrary";

vi.mock("../../services/reports.service", () => ({
  reportsRepository: {
    listAdvisories: vi.fn(),
    createAdvisory: vi.fn(),
    updateAdvisory: vi.fn(),
    deleteAdvisory: vi.fn(),
  },
}));

const rust: Advisory = { uuid: "adv-rust", code: "ADV-RUST-001", title: "Manage rust on susceptible varieties", content: "Scout neighbouring rows for pustules.\nRemove heavily affected leaves.", status: "validated", category: "rust" };
const smut: Advisory = { uuid: "adv-smut", code: "ADV-SMUT-001", title: "Isolate smut-affected stools", content: "Bag whip-like shoots before cutting.", status: "validated", category: "smut" };
const ops: Advisory = { uuid: "adv-ops", code: "ADV-GENERAL-001", title: "Clean tools between affected areas", content: "Clean tools between areas.", status: "validated", category: "general" };

/** In-memory library that answers like the API, so the real hooks and cache run end to end. */
let library: Advisory[];
let used: Set<string>;

function Harness({ initial = "" }: { initial?: string }) {
  const query = useAdvisories();
  const [value, setValue] = useState(initial);
  const validated = (query.data ?? []).filter((item) => item.status === "validated");
  return <>
    <AdvisoryPicker advisories={validated} value={value} onChange={setValue} loading={query.isPending}
      loadFailed={query.isError} onRefresh={() => query.refetch()} />
    <output data-testid="selected">{value}</output>
  </>;
}

function renderPicker(initial = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Harness initial={initial} /></QueryClientProvider>);
}

beforeEach(() => {
  library = [rust, smut, ops];
  used = new Set();
  vi.mocked(reportsRepository.listAdvisories).mockReset().mockImplementation(async () => library.map((item) => ({ ...item })));
  vi.mocked(reportsRepository.createAdvisory).mockReset().mockImplementation(async (input) => {
    const created: Advisory = {
      uuid: `adv-new-${library.length}`,
      code: input.code?.trim() || `ADV-${(input.category ?? "general").toUpperCase()}-${String(library.length + 1).padStart(3, "0")}`,
      title: input.title.trim(), content: input.content.trim(), status: "validated", category: input.category ?? null,
    };
    library = [...library, created];
    return created;
  });
  vi.mocked(reportsRepository.updateAdvisory).mockReset().mockImplementation(async (uuid, input) => {
    const current = library.find((item) => item.uuid === uuid)!;
    const next = { ...current, ...(input.title !== undefined ? { title: input.title } : {}), ...(input.content !== undefined ? { content: input.content } : {}), ...(input.category !== undefined ? { category: input.category } : {}) };
    library = library.map((item) => (item.uuid === uuid ? next : item));
    return next;
  });
  vi.mocked(reportsRepository.deleteAdvisory).mockReset().mockImplementation(async (uuid) => {
    library = library.filter((item) => item.uuid !== uuid);
    return { uuid, deleted: used.has(uuid) ? "archived" : "hard" };
  });
});

describe("advisoryLibrary helpers", () => {
  it("filters by topic and by title, code or guidance text", () => {
    expect(filterAdvisories([rust, smut, ops], "", "smut")).toEqual([smut]);
    expect(filterAdvisories([rust, smut, ops], "CLEAN TOOLS", "all")).toEqual([ops]);
    expect(filterAdvisories([rust, smut, ops], "pustules", "all")).toEqual([rust]);
    expect(filterAdvisories([rust, smut, ops], "adv-smut", "all")).toEqual([smut]);
  });

  it("finds a near-duplicate title but ignores short or unrelated ones", () => {
    expect(findSimilarAdvisory("Isolate smut affected stools now", [rust, smut, ops])).toBe(smut);
    expect(findSimilarAdvisory("clean tools", [rust, smut, ops])).toBe(ops);
    expect(findSimilarAdvisory("Isolate smut-affected stools", [smut], smut.uuid)).toBeUndefined();
    expect(findSimilarAdvisory("Water the field", [rust, smut, ops])).toBeUndefined();
    expect(findSimilarAdvisory("ab", [rust, smut, ops])).toBeUndefined();
  });
});

describe("AdvisoryPicker browsing", () => {
  it("lists the library and previews the full guidance of the selected advisory", async () => {
    const user = userEvent.setup();
    renderPicker();
    const group = await screen.findByRole("radiogroup", { name: "Advisory to send" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByRole("region", { name: "Selected advisory" })).not.toBeInTheDocument();

    await user.click(within(group).getByRole("radio", { name: /Manage rust/ }));
    const preview = screen.getByRole("region", { name: "Selected advisory" });
    expect(within(preview).getByRole("heading", { name: rust.title })).toBeInTheDocument();
    expect(preview).toHaveTextContent("Scout neighbouring rows for pustules.");
    expect(preview).toHaveTextContent("Remove heavily affected leaves.");
    expect(screen.getByTestId("selected")).toHaveTextContent("adv-rust");
  });

  it("filters with the search box and the topic chips, and recovers from no match", async () => {
    const user = userEvent.setup();
    renderPicker();
    await screen.findByRole("radiogroup", { name: "Advisory to send" });

    await user.click(screen.getByRole("button", { name: "Smut" }));
    expect(screen.getByRole("button", { name: "Smut" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /Isolate smut/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All" }));
    await user.type(screen.getByRole("searchbox", { name: "Search advisories" }), "clean tools");
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /Clean tools/ })).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "Search advisories" }));
    await user.type(screen.getByRole("searchbox", { name: "Search advisories" }), "zzz");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Clear search and topic" }));
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("only offers topic chips for topics that exist in the library", async () => {
    renderPicker();
    await screen.findByRole("radiogroup", { name: "Advisory to send" });
    const chips = within(screen.getByRole("group", { name: "Filter by topic" })).getAllByRole("button").map((chip) => chip.textContent);
    expect(chips).toEqual(["All", "Rust", "Smut", "General field ops"]);
  });

  it("keeps the selected advisory previewed while the list is filtered away from it", async () => {
    const user = userEvent.setup();
    renderPicker("adv-rust");
    await screen.findByRole("radiogroup", { name: "Advisory to send" });
    await user.click(screen.getByRole("button", { name: "Smut" }));
    expect(screen.getByRole("region", { name: "Selected advisory" })).toHaveTextContent(rust.title);
  });

  it("moves the choice with the arrow keys", async () => {
    const user = userEvent.setup();
    renderPicker();
    await screen.findByRole("radiogroup", { name: "Advisory to send" });
    await user.tab();
    await user.tab();
    await user.tab();
    const first = screen.getByRole("radio", { name: /Manage rust/ });
    first.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /Isolate smut/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Isolate smut/ })).toHaveFocus();
    expect(screen.getByTestId("selected")).toHaveTextContent("adv-smut");
  });
});

describe("AdvisoryPicker states", () => {
  it("shows a loading state, then the library", async () => {
    renderPicker();
    expect(screen.getByText("Loading advisories…")).toBeInTheDocument();
    expect(await screen.findByRole("radiogroup", { name: "Advisory to send" })).toBeInTheDocument();
  });

  it("explains a failed load and retries it", async () => {
    const user = userEvent.setup();
    vi.mocked(reportsRepository.listAdvisories).mockRejectedValueOnce(new Error("offline"));
    renderPicker();
    expect(await screen.findByText("The advisory library could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New advisory" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry advisories" }));
    expect(await screen.findByRole("radiogroup", { name: "Advisory to send" })).toBeInTheDocument();
    expect(reportsRepository.listAdvisories).toHaveBeenCalledTimes(2);
  });

  it("offers one way to create from an empty library, and nothing to search", async () => {
    library = [];
    renderPicker();
    expect(await screen.findByText("No advisories yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New advisory" })).toHaveLength(1);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });
});

describe("AdvisoryPicker create", () => {
  it("adds the first advisory from an empty library and selects it at once", async () => {
    const user = userEvent.setup();
    library = [];
    renderPicker();
    await user.click(await screen.findByRole("button", { name: "New advisory" }));

    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Mosaic roguing steps");
    await user.selectOptions(screen.getByLabelText("Topic"), "mosaic");
    await user.type(screen.getByLabelText("Guidance"), "Remove mottled plants early.");
    await user.click(screen.getByRole("button", { name: "Save & select" }));

    await waitFor(() => expect(reportsRepository.createAdvisory).toHaveBeenCalledWith({
      title: "Mosaic roguing steps", content: "Remove mottled plants early.", category: "mosaic", code: "",
    }));
    const preview = await screen.findByRole("region", { name: "Selected advisory" });
    expect(preview).toHaveTextContent("Mosaic roguing steps");
    expect(preview).toHaveTextContent("ADV-MOSAIC-001");
    expect(screen.getByRole("radio", { name: /Mosaic roguing steps/ })).toBeChecked();
    expect(screen.getByTestId("selected")).not.toBeEmptyDOMElement();
    expect(screen.getByText("Advisory added and selected.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "New advisory" })).not.toBeInTheDocument();
  });

  it("blocks an empty title or guidance with a plain message and does not call the server", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(await screen.findByRole("button", { name: "New advisory" }));
    await user.click(screen.getByRole("button", { name: "Save & select" }));
    expect(screen.getByText("Add a title.")).toBeInTheDocument();
    expect(screen.getByText("Add the guidance to send.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toBeInvalid();
    expect(reportsRepository.createAdvisory).not.toHaveBeenCalled();
  });

  it("shows server validation next to the field and keeps what was typed", async () => {
    const user = userEvent.setup();
    vi.mocked(reportsRepository.createAdvisory).mockRejectedValueOnce(
      new ApiError("The given data was invalid.", { status: 422, code: "VALIDATION_ERROR", errors: { code: ["That code is already used by another advisory."] } }),
    );
    renderPicker();
    await user.click(await screen.findByRole("button", { name: "New advisory" }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Brand new wording");
    await user.type(screen.getByRole("textbox", { name: /Code/ }), "ADV-RUST-001");
    await user.type(screen.getByLabelText("Guidance"), "Some guidance.");
    await user.click(screen.getByRole("button", { name: "Save & select" }));

    expect(await screen.findByText("That code is already used by another advisory.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Code/ })).toBeInvalid();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Brand new wording");
    expect(screen.getByTestId("selected")).toBeEmptyDOMElement();
  });

  it("hints at a similar advisory while typing and lets the reviewer use it instead", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(await screen.findByRole("button", { name: "New advisory" }));
    expect(screen.queryByText(/similar advisory already exists/)).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Title" }), "Isolate smut affected stools");
    const hint = screen.getByText(/A similar advisory already exists/);
    expect(hint).toHaveTextContent("Isolate smut-affected stools");

    await user.click(screen.getByRole("button", { name: "Use it instead" }));
    expect(reportsRepository.createAdvisory).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: /Isolate smut/ })).toBeChecked();
    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
  });

  it("saves with Enter from a single-line field instead of leaking to the review form", async () => {
    const user = userEvent.setup();
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><form onSubmit={submit}><Harness /></form></QueryClientProvider>);
    await user.click(await screen.findByRole("button", { name: "New advisory" }));
    await user.type(screen.getByLabelText("Guidance"), "Body text.");
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Enter saves{Enter}");
    await waitFor(() => expect(reportsRepository.createAdvisory).toHaveBeenCalledTimes(1));
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels the form with Escape, returns focus, and keeps the selection", async () => {
    const user = userEvent.setup();
    renderPicker("adv-rust");
    await user.click(await screen.findByRole("button", { name: "New advisory" }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Draft wording");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New advisory" })).toHaveFocus();
    expect(screen.getByTestId("selected")).toHaveTextContent("adv-rust");
    expect(reportsRepository.createAdvisory).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "New advisory" }));
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("");
  });
});

describe("AdvisoryPicker edit", () => {
  it("rewords the selected advisory in place, keeps it selected and notes the effect on future sends", async () => {
    const user = userEvent.setup();
    renderPicker("adv-rust");
    await user.click(await screen.findByRole("button", { name: `Edit ${rust.title}` }));

    expect(screen.getByRole("heading", { name: "Edit advisory" })).toBeInTheDocument();
    expect(screen.getByText("Changes apply to future sends only. Past cases keep their wording.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(rust.title);
    await user.clear(screen.getByRole("textbox", { name: "Title" }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Rust: scout and trim");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(reportsRepository.updateAdvisory).toHaveBeenCalledWith("adv-rust", expect.objectContaining({ title: "Rust: scout and trim", category: "rust" })));
    expect(await screen.findByRole("radio", { name: /Rust: scout and trim/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /Manage rust/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Selected advisory" })).toHaveTextContent("Rust: scout and trim");
    expect(screen.getByTestId("selected")).toHaveTextContent("adv-rust");
    expect(screen.getByRole("button", { name: "Edit Rust: scout and trim" })).toHaveFocus();
  });

  it("does not flag the advisory being edited as its own similar title", async () => {
    const user = userEvent.setup();
    renderPicker("adv-smut");
    await user.click(await screen.findByRole("button", { name: `Edit ${smut.title}` }));
    expect(screen.queryByText(/similar advisory already exists/)).not.toBeInTheDocument();
  });

  it("explains a refused edit and keeps the form open", async () => {
    const user = userEvent.setup();
    vi.mocked(reportsRepository.updateAdvisory).mockRejectedValueOnce(
      new ApiError("invalid", { status: 422, errors: { status: ["This advisory was removed from the office library and can no longer be edited."] } }),
    );
    renderPicker("adv-rust");
    await user.click(await screen.findByRole("button", { name: `Edit ${rust.title}` }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("This advisory was removed from the office library and can no longer be edited.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
  });
});

describe("AdvisoryPicker delete", () => {
  async function openDelete(user: ReturnType<typeof userEvent.setup>, advisory: Advisory) {
    await user.click(await screen.findByRole("button", { name: `Delete ${advisory.title}` }));
    return screen.getByRole("dialog", { name: "Delete this advisory?" });
  }

  it("states both outcomes before deleting and cancels without changes", async () => {
    const user = userEvent.setup();
    renderPicker("adv-rust");
    const dialog = await openDelete(user, rust);
    expect(dialog).toHaveAccessibleDescription(/removed if no case has sent it.*archived and past cases keep their wording/);
    expect(within(dialog).getByText(rust.title)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(reportsRepository.deleteAdvisory).not.toHaveBeenCalled();
    expect(screen.getByTestId("selected")).toHaveTextContent("adv-rust");
  });

  it("removes a never-used advisory for good and clears the selection", async () => {
    const user = userEvent.setup();
    renderPicker("adv-rust");
    const dialog = await openDelete(user, rust);
    await user.click(within(dialog).getByRole("button", { name: "Delete advisory" }));

    await waitFor(() => expect(screen.queryByRole("radio", { name: /Manage rust/ })).not.toBeInTheDocument());
    expect(reportsRepository.deleteAdvisory).toHaveBeenCalledWith("adv-rust");
    expect(screen.getByTestId("selected")).toBeEmptyDOMElement();
    expect(screen.queryByRole("region", { name: "Selected advisory" })).not.toBeInTheDocument();
    expect(screen.getByText("Advisory removed.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("archives an advisory that cases already used and says past cases keep their wording", async () => {
    const user = userEvent.setup();
    used.add("adv-smut");
    renderPicker("adv-smut");
    const dialog = await openDelete(user, smut);
    await user.click(within(dialog).getByRole("button", { name: "Delete advisory" }));

    await waitFor(() => expect(screen.queryByRole("radio", { name: /Isolate smut/ })).not.toBeInTheDocument());
    expect(screen.getByText("Advisory archived. Past cases keep their wording.")).toBeInTheDocument();
    expect(screen.getByTestId("selected")).toBeEmptyDOMElement();
  });

  it("keeps the dialog open with an error when the delete fails", async () => {
    const user = userEvent.setup();
    vi.mocked(reportsRepository.deleteAdvisory).mockRejectedValueOnce(new ApiError("down", { status: 500 }));
    renderPicker("adv-rust");
    const dialog = await openDelete(user, rust);
    await user.click(within(dialog).getByRole("button", { name: "Delete advisory" }));
    expect(await within(dialog).findByText("The advisory could not be deleted. Try again.")).toBeInTheDocument();
    expect(screen.getByTestId("selected")).toHaveTextContent("adv-rust");
  });

  it("treats an advisory someone else already removed as gone and reloads the library", async () => {
    const user = userEvent.setup();
    vi.mocked(reportsRepository.deleteAdvisory).mockRejectedValueOnce(new ApiError("gone", { status: 404 }));
    renderPicker("adv-rust");
    const dialog = await openDelete(user, rust);
    library = library.filter((item) => item.uuid !== "adv-rust");
    await user.click(within(dialog).getByRole("button", { name: "Delete advisory" }));

    await waitFor(() => expect(screen.queryByRole("radio", { name: /Manage rust/ })).not.toBeInTheDocument());
    expect(screen.getByText("Advisory was already removed.")).toBeInTheDocument();
    expect(screen.getByTestId("selected")).toBeEmptyDOMElement();
  });
});

describe("AdvisoryPicker unavailable selection", () => {
  it("shows the server's removed-from-library message inline above the list", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Wrapped() {
      const query = useAdvisories();
      return <AdvisoryPicker advisories={query.data ?? []} value="" onChange={() => undefined} onRefresh={() => query.refetch()}
        unavailableMessage="This advisory was removed from the office library. Pick another one." />;
    }
    render(<QueryClientProvider client={client}><Wrapped /></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("This advisory was removed from the office library. Pick another one.");
  });
});
