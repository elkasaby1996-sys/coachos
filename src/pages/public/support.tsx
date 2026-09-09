import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  ShieldCheck,
} from "../../lib/icons";
import { useSessionAuth } from "../../lib/auth";
import { AppFooter } from "../../components/common/app-footer";
import "../../styles/support.css";
import { SupportRequestForm } from "../../features/support/support-request-form";

const supportEmail = "support@repsync.com";
const description =
  "Get help with your RepSync account, billing, or coaching workspace.";
const emailLink = (subject: string) =>
  `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}`;
const requestDetails = [
  {
    title: "Your account",
    description: "The email you use for RepSync and your workspace name.",
  },
  {
    title: "What happened",
    description: "The page you were on, what you tried, and what you expected.",
  },
  {
    title: "A little context",
    description:
      "Any error message, plus the browser or device you were using.",
  },
];

export function SupportPage() {
  const { isAuthenticated } = useSessionAuth();
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Support | RepSync";
    document.body.classList.add("public-info-portal-light");
    const existing = document.head.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const meta = existing ?? document.createElement("meta");
    const previousDescription = meta.getAttribute("content");
    meta.name = "description";
    meta.content = description;
    if (!existing) document.head.appendChild(meta);
    return () => {
      document.title = previousTitle;
      document.body.classList.remove("public-info-portal-light");
      if (!existing) meta.remove();
      else if (previousDescription === null) meta.removeAttribute("content");
      else meta.content = previousDescription;
    };
  }, []);
  return (
    <div className="light support-page">
      <a href="#support-content" className="support-skip-link">
        Skip to content
      </a>
      <header className="support-header">
        <div className="support-container support-header-inner">
          <Link to="/" className="support-wordmark" aria-label="RepSync home">
            REPSYNC
          </Link>
          <Link to="/login" className="support-back-link">
            <ArrowLeft size={16} aria-hidden="true" />
            {isAuthenticated ? "Back to RepSync" : "Back to sign in"}
          </Link>
        </div>
      </header>
      <main
        id="support-content"
        className="support-container support-main"
        tabIndex={-1}
      >
        <section className="support-contact" aria-labelledby="support-title">
          <div className="support-intro">
            <h1 id="support-title">How can we help?</h1>
            <p className="support-description">
              A question about your account or something not working? The
              RepSync team is here to help.
            </p>
            <SupportRequestForm />
          </div>
          <aside
            className="support-details"
            aria-labelledby="support-details-title"
          >
            <h2 id="support-details-title">Help us help you</h2>
            <p>A few details can save a lot of back and forth.</p>
            <ol>
              {requestDetails.map((detail, index) => (
                <li key={detail.title}>
                  <span className="support-step" aria-hidden="true">
                    0{index + 1}
                  </span>
                  <div>
                    <h3>{detail.title}</h3>
                    <p>{detail.description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="support-privacy-note">
              <ShieldCheck size={19} aria-hidden="true" />
              <p>
                Keep passwords, payment card numbers, and private client health
                details out of your message.
              </p>
            </div>
          </aside>
        </section>
        <section
          className="support-quick-help"
          aria-labelledby="quick-help-title"
        >
          <div className="support-quick-help-heading">
            <h2 id="quick-help-title">A good place to start</h2>
            <p>A few quick answers before you get in touch.</p>
          </div>
          <div className="support-questions">
            <details>
              <summary>
                I can’t sign in
                <ChevronDown size={19} aria-hidden="true" />
              </summary>
              <div className="support-answer">
                <p>
                  Use the email linked to your RepSync account to reset your
                  password. Still having trouble? Email us from that address and
                  include the message you see when signing in.
                </p>
                <Link to="/forgot-password">
                  Reset your password{" "}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </details>
            <details>
              <summary>
                I have a billing question
                <ChevronDown size={19} aria-hidden="true" />
              </summary>
              <div className="support-answer">
                <p>
                  Include your workspace name, account email, and the invoice or
                  charge date. Account access and billing issues are reviewed
                  first.
                </p>
                <a href={emailLink("RepSync billing question")}>
                  Contact us about billing{" "}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </div>
            </details>
            <details>
              <summary>
                Something isn’t working as expected
                <ChevronDown size={19} aria-hidden="true" />
              </summary>
              <div className="support-answer">
                <p>
                  Check your connection and refresh the page after saving your
                  work. If the issue continues, send the steps that led to it,
                  your browser or device, and any error message.
                </p>
                <a href={emailLink("RepSync technical issue")}>
                  Report an issue <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </div>
            </details>
          </div>
        </section>
      </main>
      <AppFooter
        surface="transparent"
        className="support-footer"
        contentClassName="support-container"
      />
    </div>
  );
}
