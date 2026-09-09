import { useRef, useState, type FormEvent } from "react";
import { useSessionAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { ArrowRight, CheckCircle2 } from "../../lib/icons";
import { NotificationToast } from "../../components/common/notification-toast";

export function SupportRequestForm() {
  const { user } = useSessionAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; email: string } | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const attempt = useRef<{ payload: string; id: string } | null>(null);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const payload = {
      p_name: text("name"),
      p_email: text("email"),
      p_workspace_name: text("workspace"),
      p_topic: text("topic"),
      p_message: text("message"),
    };
    if (!payload.p_name || payload.p_message.length < 20) {
      setError(
        "Please enter your name and describe the issue in at least 20 characters.",
      );
      return;
    }
    const signature = JSON.stringify(payload);
    if (attempt.current?.payload !== signature) {
      attempt.current = { payload: signature, id: crypto.randomUUID() };
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data, error: requestError } = await supabase.rpc(
        "submit_support_request",
        {
          ...payload,
          p_request_id: attempt.current.id,
        },
      );
      if (requestError) throw requestError;
      if (typeof data !== "string" || data !== attempt.current.id)
        throw new Error("Missing receipt");
      setReceipt({ id: data, email: payload.p_email });
      setToast("Your support request has been received.");
    } catch (cause) {
      const message =
        cause && typeof cause === "object" && "message" in cause
          ? String(cause.message)
          : "";
      setError(
        message.includes("Too many support requests")
          ? "Too many requests. Please try again in an hour, or email support@repsync.com."
          : "We couldn’t submit your request. Your details are still here—please try again, or email support@repsync.com.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="support-form-section">
      <NotificationToast
        title="Request received"
        message={toast}
        onDismiss={() => setToast(null)}
      />
      {receipt ? (
        <div className="support-form-receipt" role="status">
          <CheckCircle2 size={28} weight="duotone" aria-hidden="true" />
          <h2>Request received</h2>
          <p>
            Your request has been saved. Your contact email is{" "}
            <strong>{receipt.email}</strong>.
          </p>
          <p className="support-reference">
            Reference: <span>{receipt.id}</span>
          </p>
          <button
            className="support-form-secondary"
            type="button"
            onClick={() => {
              setReceipt(null);
              attempt.current = null;
              setToast(null);
            }}
          >
            Send another request
          </button>
        </div>
      ) : (
        <form
          key={user?.id ?? "guest"}
          onSubmit={submit}
          aria-labelledby="support-form-title"
          aria-busy={busy}
        >
          <h2 id="support-form-title">Get in touch</h2>
          <p className="support-form-intro">
            Tell us what’s happening and we’ll help you find the next step.
          </p>
          <fieldset disabled={busy} className="support-form-fields">
            <div className="support-form-row">
              <div className="support-form-field">
                <label htmlFor="support-name">Name</label>
                <input
                  id="support-name"
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={120}
                />
              </div>
              <div className="support-form-field">
                <label htmlFor="support-email">Email</label>
                <input
                  id="support-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={user?.email ?? ""}
                  required
                  maxLength={254}
                />
              </div>
            </div>
            <div className="support-form-row">
              <div className="support-form-field">
                <label htmlFor="support-topic">What can we help with?</label>
                <select
                  id="support-topic"
                  name="topic"
                  defaultValue=""
                  required
                >
                  <option value="" disabled>
                    Select a topic
                  </option>
                  <option value="account">Account & sign-in</option>
                  <option value="billing">Billing</option>
                  <option value="technical">Technical issue</option>
                  <option value="other">Something else</option>
                </select>
              </div>
              <div className="support-form-field">
                <label htmlFor="support-workspace">
                  Workspace <span>(optional)</span>
                </label>
                <input
                  id="support-workspace"
                  name="workspace"
                  autoComplete="organization"
                  maxLength={160}
                />
              </div>
            </div>
            <div className="support-form-field">
              <label htmlFor="support-message">Message</label>
              <textarea
                id="support-message"
                name="message"
                required
                minLength={20}
                maxLength={5000}
                rows={5}
                placeholder="What happened, and what did you expect?"
                aria-describedby="support-message-hint"
              />
              <p id="support-message-hint">
                Include any error message and the page you were on. 20–5,000
                characters.
              </p>
            </div>
            {error && (
              <p className="support-form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="support-primary-link support-form-submit"
              type="submit"
            >
              {busy ? "Submitting…" : "Submit request"}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </fieldset>
          <p className="support-form-note">
            Your details are used to handle your request.{" "}
            <a href="/privacy">Privacy policy</a>
          </p>
        </form>
      )}
    </div>
  );
}
