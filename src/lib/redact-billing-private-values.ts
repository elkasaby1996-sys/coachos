/** Output-only policy. Never use on billing inputs, storage or comparisons. */
const reference =
  /\b(?:che|hsc|txn|ctm|sub|ntf|evt|pro|pri|res)_[a-z0-9][a-z0-9_-]*/gi;
const uuid =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const privateLabel = "[redacted provider reference]";
const urlLabel = "[redacted payment URL]";
const projectLabel = "[redacted project identifier]";
const projectReference = /\b[a-z0-9]{20}\b/g;
const capabilityKey =
  /^(?:checkouturl|portalurl|customerportal|updatepaymentmethod|signature|signedurl|capability|capabilityurl|paymenturl)$/;
const referenceKey =
  /^(?:provider)?(?:checkout|transaction|customer|subscription|notification|event|resource|product|price|user|account|billingaccount|pilot|control)(?:ref|reference|id|uuid)$/;
const secretKey =
  /^(?:authorization|accesstoken|refreshtoken|apikey|webhooksecret|password|secret|token)$/;
const projectKey =
  /^(?:(?:supabase|internal)?project|deployment|environment|organization)(?:ref|reference|id|uuid|slug)$/;

function text(value: string): string {
  if (/^\s*[{[]/.test(value)) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object")
        return JSON.stringify(redactBillingPrivateValues(parsed));
    } catch {
      /* Ordinary text, including closed redaction labels. */
    }
  }
  return value
    .replace(
      /\b([a-z][a-z0-9_-]*)["']?\s*[:=]\s*("[^"\n]*"|'[^'\n]*'|[^\s,;<>]+)/gi,
      (whole, key: string, raw: string) => {
        if (raw.startsWith("[redacted")) return whole;
        const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
        const label = capabilityKey.test(normalized)
          ? urlLabel
          : projectKey.test(normalized)
            ? projectLabel
            : referenceKey.test(normalized)
              ? privateLabel
              : secretKey.test(normalized)
                ? "[redacted secret]"
                : null;
        return label ? `${key}=${label}` : whole;
      },
    )
    .replace(
      /(?:(?:https?|postgres(?:ql)?):\/\/[^\s"<>]*?(?:db\.)?[a-z0-9]{20}\.supabase\.(?:co|in)[^\s"<>]*|(?:db\.)?[a-z0-9]{20}\.supabase\.(?:co|in)(?:[^\s"<>]*)?)/g,
      projectLabel,
    )
    .replace(
      /https?:\/\/(?:app\.)?supabase\.com\/dashboard\/project\/[a-z0-9]{20}(?:[^\s"<>]*)?/g,
      projectLabel,
    )
    .replace(
      /\b(?:che|hsc|txn|ctm|sub|ntf|evt|pro|pri|res)%5f[a-z0-9_%.-]+/gi,
      privateLabel,
    )
    .replace(
      /(?:https?:\/\/|(?:[a-z0-9-]+\.)+(?:paddle\.(?:com|io)|lemonsqueezy\.com)\/)[^\s"<>]+/gi,
      (candidate) =>
        /lemonsqueezy\.com|paddle\.(?:io|com)|[?&](?:signature|expires|_ptxn|transaction_id|token)=|\/billing(?:[/?#]|$)|\/subscription\/[^/]+\/payment-details/i.test(
          candidate,
        )
          ? urlLabel
          : candidate,
    )
    .replace(projectReference, projectLabel)
    .replace(reference, privateLabel)
    .replace(uuid, "[redacted private identifier]")
    .replace(
      /\b(?:pdl_(?:sdbx|live)_[a-z0-9_]+|pdl_ntfset_[a-z0-9_]+|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)\b/gi,
      "[redacted secret]",
    )
    .replace(
      /\b(signature|authorization|access_token|refresh_token|api_key|webhook_secret)\s*[=:](?!\s*\[redacted )\s*[^\s,;"<>]+/gi,
      "$1=[redacted secret]",
    );
}

/** Copies data and Error details without invoking accessors or custom toJSON. */
export function redactBillingPrivateValues<T>(value: T): T {
  const ancestors = new WeakSet<object>();
  function visit(input: unknown): unknown {
    if (typeof input === "string") return text(input);
    if (typeof input === "function") return "[function omitted]";
    if (typeof input === "bigint") return input.toString();
    if (!input || typeof input !== "object") return input;
    if (ancestors.has(input)) return "[circular]";
    ancestors.add(input);
    try {
      if (Array.isArray(input)) return input.map(visit);
      const output: Record<string, unknown> = Object.create(null);
      for (const [key, descriptor] of Object.entries(
        Object.getOwnPropertyDescriptors(input),
      )) {
        if (!descriptor.enumerable && !(input instanceof Error)) continue;
        const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
        const cleanKey = text(key);
        const clean = capabilityKey.test(normalized)
          ? urlLabel
          : projectKey.test(normalized)
            ? projectLabel
            : referenceKey.test(normalized)
              ? privateLabel
              : secretKey.test(normalized)
                ? "[redacted secret]"
                : "value" in descriptor
                  ? visit(descriptor.value)
                  : "[accessor omitted]";
        let uniqueKey = cleanKey;
        for (
          let n = 2;
          Object.prototype.hasOwnProperty.call(output, uniqueKey);
          n++
        )
          uniqueKey = `${cleanKey} (${n})`;
        output[uniqueKey] = clean;
      }
      return output;
    } finally {
      ancestors.delete(input);
    }
  }
  return visit(value) as T;
}
