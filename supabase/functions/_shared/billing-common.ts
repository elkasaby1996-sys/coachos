/** Provider-independent request bounds, errors and input primitives. */
export class BillingError extends Error {
  constructor(
    public code: string,
    public httpStatus = 400,
    public ambiguous = false,
  ) {
    super(code);
  }
}
export function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BillingError("BILLING_INVALID_INPUT");
  return value as Record<string, any>;
}
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function boundedBody(request: Request, limit = 262_144) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new BillingError("BILLING_INVALID_INPUT");
  const reader = request.body?.getReader();
  if (!reader) throw new BillingError("BILLING_INVALID_INPUT");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new BillingError("BILLING_INVALID_INPUT");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
