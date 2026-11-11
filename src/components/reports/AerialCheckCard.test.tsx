import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/ApiError";
import type { AerialAnalysis, DiseaseReport } from "../../domain/report.types";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import {
  useAddAerialAnalysis,
  useAerialMask,
  useRemoveAerialAnalysis,
  useRestoreAerialAnalysis,
} from "../../hooks/useReports";
import { AerialCheckCard } from "./AerialCheckCard";

vi.mock("../../hooks/useOnlineStatus", () => ({ useOnlineStatus: vi.fn() }));
vi.mock("../../hooks/useReports", () => ({
  useAddAerialAnalysis: vi.fn(),
  useRemoveAerialAnalysis: vi.fn(),
  useRestoreAerialAnalysis: vi.fn(),
  useAerialMask: vi.fn(),
}));

const analysis = (overrides: Partial<AerialAnalysis> = {}): AerialAnalysis => ({
  uuid: "a1",
  imageUrl: "http://api.test/image",
  maskUrl: "http://api.test/mask",
  imageWidth: 400,
  imageHeight: 300,
  enoughCanopy: true,
  normalCanopyPercent: 82,
  abnormalCanopyPercent: 18,
  canopyCoveragePercent: 71,
  modelVersion: "aerial-v3",
  uploadedBy: { uuid: "u1", name: "Rey Reviewer" },
  createdAt: "2026-11-11T04:11:03.000Z",
  ...overrides,
});

const report = (aerialAnalyses: AerialAnalysis[], extra: Partial<DiseaseReport> = {}) =>
  ({
    uuid: "r1",
    affectedFields: [{ fieldSurveyId: 7, areaSqm: 6075, lossRatePercent: 18.5 }],
    aerialAnalyses,
    ...extra,
  }) as unknown as DiseaseReport;

type Settle = { onSuccess?: () => void };
const succeeds = () => vi.fn((_uuid: string, callbacks?: Settle) => callbacks?.onSuccess?.());

function setup(
  options: {
    online?: boolean;
    mutate?: ReturnType<typeof vi.fn>;
    pending?: boolean;
    restoreMutate?: ReturnType<typeof vi.fn>;
    restoreError?: boolean;
  } = {},
) {
  const add = { mutate: options.mutate ?? vi.fn(), isPending: options.pending ?? false };
  const remove = { mutate: vi.fn(), isPending: false, isError: false };
  const restore = {
    mutate: options.restoreMutate ?? vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: options.restoreError ?? false,
  };
  vi.mocked(useOnlineStatus).mockReturnValue(options.online ?? true);
  vi.mocked(useAddAerialAnalysis).mockReturnValue(add as never);
  vi.mocked(useRemoveAerialAnalysis).mockReturnValue(remove as never);
  vi.mocked(useRestoreAerialAnalysis).mockReturnValue(restore as never);
  vi.mocked(useAerialMask).mockReturnValue({ data: undefined, isError: false } as never);
  return { add, remove, restore };
}

describe("AerialCheckCard", () => {
  beforeEach(() => vi.clearAllMocks());

  // Intent: an office user can start a check from the case page with one file choice.
  it("uploads a chosen photo and shows the checking state", async () => {
    const mutate = vi.fn();
    setup({ mutate });
    const { rerender } = render(<AerialCheckCard report={report([])} />);
    const file = new File(["x"], "field.jpg", { type: "image/jpeg" });

    await userEvent.upload(screen.getByLabelText(/add aerial photo/i), file);
    expect(mutate).toHaveBeenCalledWith(file, expect.any(Object));

    setup({ pending: true });
    rerender(<AerialCheckCard report={report([])} />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking the photo…");
  });

  // Intent: a wrong type or oversize file is refused before any upload.
  it("rejects unsupported files without calling the server", () => {
    const mutate = vi.fn();
    setup({ mutate });
    render(<AerialCheckCard report={report([])} />);

    fireEvent.change(screen.getByLabelText(/add aerial photo/i), {
      target: { files: [new File(["x"], "notes.pdf", { type: "application/pdf" })] },
    });

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Use a JPG, PNG or WebP under 20 MB.");
  });

  it.each([new Error("network lost"), new Error("invalid response"), new ApiError("down", { status: 503 })])(
    "reports an unknown outcome without offering an immediate retry",
    async (error) => {
      const mutate = vi.fn((_file: File, callbacks: { onError: (e: unknown) => void }) => callbacks.onError(error));
      setup({ mutate });
      render(<AerialCheckCard report={report([])} />);

      await userEvent.upload(screen.getByLabelText(/add aerial photo/i), new File(["x"], "field.png", { type: "image/png" }));
      expect(screen.getByRole("alert")).toHaveTextContent("We could not confirm the photo was added. Refresh the case and check before adding it again.");
      expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    },
  );

  it("offers a retry when the server rejects a concurrent check", async () => {
    const mutate = vi.fn((_file: File, callbacks: { onError: (e: unknown) => void }) =>
      callbacks.onError(new ApiError("busy", { status: 429 })),
    );
    setup({ mutate });
    render(<AerialCheckCard report={report([])} />);
    await userEvent.upload(screen.getByLabelText(/add aerial photo/i), new File(["x"], "field.png", { type: "image/png" }));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  // Intent: no upload is possible while offline.
  it("disables the file input offline", () => {
    setup({ online: false });
    render(<AerialCheckCard report={report([])} />);

    expect(screen.getByLabelText(/add aerial photo/i)).toBeDisabled();
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  // Intent: shares read as percent of visible cane and never as area or loss.
  it("shows the result sentence, share legend and coverage", () => {
    setup();
    render(<AerialCheckCard report={report([analysis()])} />);

    expect(screen.getByText("18%")).toBeInTheDocument();
    expect(screen.getByText(/of the visible cane looks abnormal/)).toBeInTheDocument();
    expect(screen.getByText("Normal 82%")).toBeInTheDocument();
    expect(screen.getByText("Abnormal 18%")).toBeInTheDocument();
    expect(screen.getByText("Cane visible in photo: 71%")).toBeInTheDocument();
    expect(screen.getByText("aerial-v3")).toBeInTheDocument();
  });

  // Intent: below the coverage floor no share is shown.
  it("hides the shares when too little cane is visible", () => {
    setup();
    render(
      <AerialCheckCard
        report={report([analysis({ enoughCanopy: false, normalCanopyPercent: null, abnormalCanopyPercent: null, canopyCoveragePercent: 4 })])}
      />,
    );

    expect(screen.getByText("Not enough cane visible to estimate")).toBeInTheDocument();
    expect(screen.queryByText(/of the visible cane looks abnormal/)).not.toBeInTheDocument();
  });

  // Intent: ground GPS figures and photo shares sit in separate, labelled columns, never merged.
  it("keeps ground and photo figures apart", () => {
    setup();
    render(<AerialCheckCard report={report([analysis()])} />);

    expect(screen.getByRole("heading", { name: "Measured on the ground" }).parentElement).toHaveTextContent(
      "Boundary 7: 0.61 ha · loss 18.5%",
    );
    expect(screen.getByRole("heading", { name: "Seen in this photo" }).parentElement).toHaveTextContent(
      "18% of visible cane",
    );
    expect(screen.getByText("Phone GPS · office")).toBeInTheDocument();
    expect(screen.getByText("Aerial image estimate · experimental")).toBeInTheDocument();
  });

  // Intent: removal is confirmed in-app first; earlier checks collapse under one summary.
  it("confirms removal in an in-app dialog and collapses earlier checks", async () => {
    const { remove } = setup();
    const nativeConfirm = vi.spyOn(window, "confirm");
    render(<AerialCheckCard report={report([analysis(), analysis({ uuid: "a0" })])} />);

    expect(screen.getByText("Earlier aerial checks (1)")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(remove.mutate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Remove check" }));
    expect(remove.mutate).toHaveBeenCalledWith("a1", expect.any(Object));
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  // Intent: declining the in-app confirm leaves the check in place.
  it("keeps the check when removal is declined", async () => {
    const { remove } = setup();
    render(<AerialCheckCard report={report([analysis()])} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(remove.mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Intent: removing the latest check offers an in-app Undo that restores it on the server.
  it("offers Undo after the latest check is removed and restores it", async () => {
    const restoreMutate = succeeds();
    const { remove } = setup({ restoreMutate });
    remove.mutate = succeeds();
    render(<AerialCheckCard report={report([analysis(), analysis({ uuid: "a0" })])} />);

    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(screen.getByRole("dialog")).toHaveTextContent("You can undo the removal right after.");
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/add the photo again/i);
    await userEvent.click(screen.getByRole("button", { name: "Remove check" }));

    expect(screen.getByRole("status")).toHaveTextContent("Check removed.");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(restoreMutate).toHaveBeenCalledWith("a1", expect.any(Object));
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  // Intent: removing an earlier check through the same confirmation offers Undo for that check.
  it("offers Undo for an earlier check and restores that check", async () => {
    const restoreMutate = succeeds();
    const { remove } = setup({ restoreMutate });
    remove.mutate = succeeds();
    render(<AerialCheckCard report={report([analysis(), analysis({ uuid: "a0" })])} />);

    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    await userEvent.click(screen.getByRole("button", { name: "Remove check" }));
    expect(remove.mutate).toHaveBeenCalledWith("a0", expect.any(Object));
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(restoreMutate).toHaveBeenCalledWith("a0", expect.any(Object));
  });

  // Intent: Undo only appears once the removal succeeded on the server.
  it("does not offer Undo when the removal has not succeeded", async () => {
    setup();
    render(<AerialCheckCard report={report([analysis()])} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove check" }));
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  // Intent: a refused file is not an added photo, so the pending Undo stays available.
  it("keeps Undo when the chosen file is refused", async () => {
    const mutate = vi.fn();
    const { remove } = setup({ mutate });
    remove.mutate = succeeds();
    render(<AerialCheckCard report={report([analysis()])} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove check" }));
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();

    const oversized = new File(["x"], "huge.jpg", { type: "image/jpeg" });
    Object.defineProperty(oversized, "size", { value: 20 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByLabelText(/another aerial photo/i), { target: { files: [oversized] } });

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Use a JPG, PNG or WebP under 20 MB.");
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  // Intent: a failed later removal never replaces the earlier Undo target.
  it("keeps the previous Undo target when another removal fails", async () => {
    const restoreMutate = succeeds();
    const { remove } = setup({ restoreMutate });
    remove.mutate = succeeds();
    render(<AerialCheckCard report={report([analysis(), analysis({ uuid: "a0" })])} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Remove check" }));

    remove.mutate = vi.fn();
    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    await userEvent.click(screen.getByRole("button", { name: "Remove check" }));
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(restoreMutate).toHaveBeenCalledWith("a1", expect.any(Object));
  });

  // Intent: a failed undo says so and keeps Undo available to try again.
  it("keeps Undo available when restoring fails", async () => {
    const restoreMutate = vi.fn();
    const { remove } = setup({ restoreMutate, restoreError: true });
    remove.mutate = succeeds();
    render(<AerialCheckCard report={report([analysis()])} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove check" }));
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Could not undo. Try again.");
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  });

  // Intent: the aerial check opens on problem areas only, and the compare slider keeps one accurate name in every mode.
  it("defaults to problem areas and keeps the compare slider name mode-neutral", async () => {
    setup();
    render(<AerialCheckCard report={report([analysis()])} />);
    expect(screen.getByRole("radio", { name: "Problem areas" })).toBeChecked();

    for (const mode of ["Photo only", "Problem and healthy", "Problem areas"]) {
      await userEvent.click(screen.getByRole("radio", { name: mode }));
      expect(screen.getByRole("radio", { name: mode })).toBeChecked();
      expect(screen.getByRole("slider", { name: "Highlight reveal" })).toBeInTheDocument();
    }
  });
});
