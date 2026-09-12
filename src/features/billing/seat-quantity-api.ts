import {
  seatQuantityStateSchema,
  seatQuantityPreviewSchema,
  safeSeatQuantityError,
} from "./seat-quantity-contracts";
export async function fetchSeatQuantityState() {
  const { supabase } = await import("../../lib/supabase");
  const { data, error } = await supabase.rpc(
    "get_my_billing_seat_quantity_state",
  );
  if (error) throw safeSeatQuantityError(error);
  const parsed = seatQuantityStateSchema.safeParse(data);
  if (!parsed.success) throw safeSeatQuantityError(null);
  return parsed.data;
}
export async function requestSeatQuantity(
  action: "preview" | "apply" | "cancel" | "refresh",
  body: Record<string, unknown>,
) {
  const { supabase } = await import("../../lib/supabase");
  const endpoint = {
    preview: "billing-preview-coach-seat-change",
    apply: "billing-change-coach-seat-quantity",
    cancel: "billing-cancel-scheduled-seat-change",
    refresh: "billing-refresh-coach-seat-change",
  }[action];
  const { data, error } = await supabase.functions.invoke(endpoint, { body });
  if (error) {
    let safe: unknown;
    try {
      safe = await error.context?.json();
    } catch {
      /* Discard raw provider data. */
    }
    throw safeSeatQuantityError(safe);
  }
  const parsed =
    action === "preview"
      ? seatQuantityPreviewSchema.safeParse(data)
      : seatQuantityStateSchema.safeParse(data);
  if (!parsed.success) throw safeSeatQuantityError(null);
  return parsed.data;
}
