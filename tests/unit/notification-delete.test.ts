import { beforeEach, describe, expect, it, vi } from "vitest";
const { query, from } = vi.hoisted(() => {
  const query = {
    delete: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(),
  };
  return { query, from: vi.fn(() => query) };
});
vi.mock("../../src/lib/supabase", () => ({ supabase: { from } }));
import { deleteNotification } from "../../src/features/notifications/api/notifications";
beforeEach(() => {
  vi.clearAllMocks();
  query.delete.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
});
describe("deleteNotification", () => {
  it("deletes only the recipient's in-app delivery", async () => {
    query.maybeSingle.mockResolvedValue({
      data: { id: "delivery-1" },
      error: null,
    });
    await expect(deleteNotification("delivery-1", "user-1")).resolves.toBe(
      "delivery-1",
    );
    expect(from).toHaveBeenCalledWith("notification_deliveries");
    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.eq.mock.calls).toEqual([
      ["id", "delivery-1"],
      ["recipient_user_id", "user-1"],
      ["channel", "in_app"],
    ]);
  });
  it("does not report success when RLS prevents deletion", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(
      deleteNotification("other-delivery", "user-1"),
    ).rejects.toThrow("could not be deleted");
  });
  it("propagates database errors", async () => {
    query.maybeSingle.mockResolvedValue({
      data: null,
      error: new Error("Offline"),
    });
    await expect(deleteNotification("delivery-1", "user-1")).rejects.toThrow(
      "Offline",
    );
  });
});
