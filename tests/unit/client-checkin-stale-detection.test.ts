import { describe, expect, it } from "vitest";
import {
  resolveAcceptedCheckinDefinitionSignature,
  resolveCheckinDefinitionChange,
} from "../../src/lib/client-checkin-stale-detection";

describe("client check-in stale detection", () => {
  it("captures the rendered signature after an initial null baseline", () => {
    expect(
      resolveAcceptedCheckinDefinitionSignature({
        key: "checkin-1:template-1",
        previousKey: "checkin-1:template-1",
        acceptedSignature: null,
        renderedSignature: "rendered-v1",
        latestFetchedSignature: null,
      }),
    ).toEqual({
      key: "checkin-1:template-1",
      signature: "rendered-v1",
      resetLocalState: false,
    });
  });

  it("keeps a changed fetched signature from becoming the baseline when a rendered baseline exists", () => {
    expect(
      resolveAcceptedCheckinDefinitionSignature({
        key: "checkin-1:template-1",
        previousKey: "checkin-1:template-1",
        acceptedSignature: "rendered-v1",
        renderedSignature: "rendered-v1",
        latestFetchedSignature: "rendered-v2",
      }),
    ).toEqual({
      key: "checkin-1:template-1",
      signature: "rendered-v1",
      resetLocalState: false,
    });
  });

  it("does not capture a baseline from a null loading signature", () => {
    expect(
      resolveAcceptedCheckinDefinitionSignature({
        key: "checkin-2:template-2",
        previousKey: "checkin-1:template-1",
        acceptedSignature: "rendered-v1",
        renderedSignature: null,
        latestFetchedSignature: null,
      }),
    ).toEqual({
      key: "checkin-1:template-1",
      signature: "rendered-v1",
      resetLocalState: false,
    });
  });

  it("warns both clean and dirty forms when the direct-polled signature changes", () => {
    expect(
      resolveCheckinDefinitionChange({
        acceptedSignature: "rendered-v1",
        latestSignature: "rendered-v2",
        formDirty: false,
      }),
    ).toBe("warn-stale");

    expect(
      resolveCheckinDefinitionChange({
        acceptedSignature: "rendered-v1",
        latestSignature: "rendered-v2",
        formDirty: true,
      }),
    ).toBe("warn-stale");
  });
});
