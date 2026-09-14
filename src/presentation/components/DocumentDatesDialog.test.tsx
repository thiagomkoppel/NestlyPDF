import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DocumentDatesDialog } from "./DocumentDatesDialog";

const sourceDates = {
  creationDate: new Date(2019, 4, 6, 7, 8).getTime(),
  modificationDate: new Date(2020, 5, 7, 8, 9).getTime(),
};

describe("DocumentDatesDialog", () => {
  it("offers the dates the export will write, starting from the open document", () => {
    render(
      <DocumentDatesDialog
        documentDates={sourceDates}
        sourceDocumentDates={sourceDates}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "PDF dates" })).toBeInTheDocument();
    expect(screen.getByLabelText("Created")).toHaveValue("2019-05-06T07:08");
    expect(screen.getByLabelText("Modified")).toHaveValue("2020-06-07T08:09");
  });

  it("applies the dates the user picked", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <DocumentDatesDialog
        documentDates={sourceDates}
        sourceDocumentDates={sourceDates}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );

    const created = screen.getByLabelText("Created");
    await user.clear(created);
    await user.type(created, "2001-02-03T04:05");
    await user.click(screen.getByRole("button", { name: "Apply dates" }));

    expect(onApply).toHaveBeenCalledWith({
      creationDate: new Date(2001, 1, 3, 4, 5).getTime(),
      modificationDate: sourceDates.modificationDate,
    });
  });

  it("keeps the file's own date when a field is cleared", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <DocumentDatesDialog
        documentDates={sourceDates}
        sourceDocumentDates={sourceDates}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Created"));
    await user.clear(screen.getByLabelText("Modified"));
    await user.click(screen.getByRole("button", { name: "Apply dates" }));

    expect(onApply).toHaveBeenCalledWith({});
  });

  it("restores the dates the file was opened with", async () => {
    const user = userEvent.setup();
    render(
      <DocumentDatesDialog
        documentDates={{ creationDate: new Date(2001, 1, 3, 4, 5).getTime() }}
        sourceDocumentDates={sourceDates}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Created")).toHaveValue("2001-02-03T04:05");
    await user.click(screen.getByRole("button", { name: "Restore original dates" }));

    expect(screen.getByLabelText("Created")).toHaveValue("2019-05-06T07:08");
    expect(screen.getByLabelText("Modified")).toHaveValue("2020-06-07T08:09");
  });

  it("closes without applying on Escape and on a backdrop click", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onApply = vi.fn();
    render(
      <DocumentDatesDialog
        documentDates={sourceDates}
        sourceDocumentDates={sourceDates}
        onApply={onApply}
        onCancel={onCancel}
      />,
    );

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);

    const backdrop = document.querySelector(".document-dates-backdrop");
    if (backdrop === null) {
      throw new Error("Expected the document dates backdrop to render.");
    }
    await user.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("traps keyboard focus inside the dialog", async () => {
    const user = userEvent.setup();
    render(
      <DocumentDatesDialog
        documentDates={sourceDates}
        sourceDocumentDates={sourceDates}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Created")).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "Close PDF dates dialog" })).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "Apply dates" })).toHaveFocus();
  });
});
