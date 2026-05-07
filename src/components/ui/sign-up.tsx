import React, { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  PartyPopper,
  Smartphone,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { AuthBackdrop } from "../common/auth-backdrop";
import { Link } from "react-router-dom";

export type AuthMode = "signin" | "signup";

export type AuthSubmitResult = {
  error?: string | null;
  notice?: string | null;
  success?: boolean;
};

export interface AuthComponentProps {
  mode: AuthMode;
  brandName?: string;
  logo?: React.ReactNode;
  title?: string;
  subtitle?: string;
  primaryLabel?: string;
  secondaryLinkLabel?: string;
  secondaryLinkHref?: string;
  onEmailPasswordSubmit: (payload: {
    email: string;
    password: string;
  }) => Promise<AuthSubmitResult | void>;
  onGoogle?: () => Promise<AuthSubmitResult | void>;
  onApple?: () => Promise<AuthSubmitResult | void>;
  onFacebook?: () => Promise<AuthSubmitResult | void>;
  onPhone?: () => Promise<AuthSubmitResult | void>;
  onGithub?: () => Promise<AuthSubmitResult | void>;
}

const glassButtonVariants = cva(
  "relative isolate inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-2xl outline-none transition-[background-color,border-color,box-shadow,transform] duration-200 disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      size: {
        default: "text-sm font-medium",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

const glassButtonTextVariants = cva("relative block select-none", {
  variants: {
    size: {
      default: "px-5 py-3.5",
      icon: "flex h-10 w-10 items-center justify-center",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

interface GlassButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants> {
  contentClassName?: string;
  srLabel?: string;
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, children, size, contentClassName, srLabel, ...props }, ref) => {
    return (
      <button
        ref={ref}
        aria-label={props["aria-label"] ?? srLabel}
        className={cn(
          "group border border-white/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.13),rgba(255,255,255,0.045))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_14px_28px_-24px_rgba(0,0,0,0.78)] backdrop-blur-xl hover:-translate-y-px hover:border-white/24 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.17),rgba(255,255,255,0.06))] focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          glassButtonVariants({ size }),
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "relative z-10 text-current",
            glassButtonTextVariants({ size }),
            contentClassName,
          )}
        >
          {children}
        </span>
      </button>
    );
  },
);

GlassButton.displayName = "GlassButton";

const getAuthFieldShellClassName = ({
  active,
  invalid = false,
}: {
  active: boolean;
  invalid?: boolean;
}) =>
  cn(
    "mt-1.5 flex items-center gap-3 rounded-full border px-4 py-3 shadow-[var(--field-glass-shadow)] backdrop-blur-2xl transition-[border-color,background-image,box-shadow] duration-300 [border-color:var(--field-glass-border)] [background-color:oklch(var(--bg-surface)/0.18)] [background-image:var(--field-glass-bg)] focus-within:[border-color:var(--field-glass-border-focus)] focus-within:[background-image:var(--field-glass-bg-focus)] focus-within:shadow-[var(--field-glass-shadow-focus)]",
    active
      ? "shadow-[0_18px_40px_-30px_rgba(34,211,238,0.46),var(--field-glass-shadow)] [background-color:oklch(var(--bg-surface)/0.24)]"
      : null,
    invalid
      ? "[border-color:rgba(252,165,165,0.62)] [background-image:linear-gradient(180deg,rgba(120,29,29,0.2),rgba(255,255,255,0.04))]"
      : null,
  );

const DefaultLogo = () => (
  <div className="rounded-md bg-primary p-1.5 text-primary-foreground">
    <Mail className="h-4 w-4" />
  </div>
);

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8a6 6 0 0 1 0-12c2.3 0 3.9 1 4.8 1.9l3.3-3.2A10.6 10.6 0 0 0 12 1.5a10.5 10.5 0 0 0 0 21c6.1 0 10.2-4.3 10.2-10.3 0-.7-.1-1.3-.2-2H12Z"
    />
    <path
      fill="#34A853"
      d="M1.5 12c0 1.7.4 3.2 1.2 4.6l3.8-3a6.3 6.3 0 0 1 0-3.2l-3.8-3A10.4 10.4 0 0 0 1.5 12Z"
    />
    <path
      fill="#4A90E2"
      d="M12 22.5c2.9 0 5.4-1 7.2-2.7l-3.5-2.8c-1 .7-2.2 1.2-3.7 1.2a6 6 0 0 1-5.6-4l-3.8 2.9A10.5 10.5 0 0 0 12 22.5Z"
    />
    <path
      fill="#FBBC05"
      d="M6.4 14.2a6.3 6.3 0 0 1 0-4l-3.8-2.9a10.5 10.5 0 0 0 0 9.8l3.8-2.9Z"
    />
  </svg>
);

const GitHubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2A10 10 0 0 0 8.8 21.5c.5.1.7-.2.7-.5v-1.9c-3 .7-3.7-1.3-3.7-1.3-.4-1-.9-1.4-.9-1.4-.8-.5.1-.5.1-.5.9.1 1.4 1 1.4 1 .8 1.3 2.1 1 2.6.8.1-.6.3-1 .6-1.2-2.4-.3-4.9-1.2-4.9-5.4 0-1.2.4-2.1 1-2.8-.1-.3-.4-1.4.1-2.9 0 0 .9-.3 2.9 1 .8-.2 1.7-.3 2.5-.3.9 0 1.7.1 2.5.3 2-1.3 2.9-1 2.9-1 .6 1.5.2 2.6.1 2.9.7.7 1 1.6 1 2.8 0 4.2-2.5 5.1-4.9 5.4.4.3.7.9.7 1.8V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
  </svg>
);

const AppleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.7 12.8c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.7-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8s-1.8-.8-3-.8c-1.6 0-3 .9-3.8 2.2-1.6 2.8-.4 6.9 1.2 9.2.8 1.1 1.7 2.4 2.9 2.3 1.2-.1 1.6-.7 3-.7 1.4 0 1.8.7 3 .7 1.2 0 2-.9 2.8-2 .9-1.2 1.3-2.4 1.4-2.5-.1 0-2.8-1.1-2.8-4.1Zm-2.2-6.5c.6-.7 1.1-1.7 1-2.7-.9 0-1.9.6-2.6 1.3-.6.7-1.1 1.7-1 2.7 1 .1 1.9-.5 2.6-1.3Z" />
  </svg>
);

const FacebookIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13.5 21v-7h2.3l.4-2.8h-2.7V9.4c0-.8.2-1.4 1.4-1.4h1.5V5.5c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.9v2h-2.5V14h2.5v7h3Z" />
  </svg>
);

type SocialProviderButton = {
  id: "google" | "apple" | "facebook" | "phone" | "github";
  label: string;
  action: (() => Promise<AuthSubmitResult | void>) | undefined;
  icon: React.ReactNode;
};

export function AuthComponent({
  mode,
  brandName = "Repsync",
  logo = <DefaultLogo />,
  primaryLabel,
  secondaryLinkHref,
  secondaryLinkLabel,
  onEmailPasswordSubmit,
  onGoogle,
  onApple,
  onFacebook,
  onPhone,
  onGithub,
}: AuthComponentProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busyAction, setBusyAction] = useState<
    "none" | "email" | "google" | "apple" | "facebook" | "phone" | "github"
  >("none");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const isSignUp = mode === "signup";
  const mainCtaLabel =
    primaryLabel ?? (isSignUp ? "Create account" : "Sign in");
  const isEmailValid = !email || /\S+@\S+\.\S+/.test(email.trim());
  const displayBrandName =
    brandName.toLowerCase() === "repsync" ? "RepSync" : brandName;

  const runAction = useCallback(
    async (
      action: "email" | "google" | "apple" | "facebook" | "phone" | "github",
      fn: () => Promise<AuthSubmitResult | void>,
    ) => {
      setBusyAction(action);
      setError(null);
      setNotice(null);
      try {
        const result = (await fn()) ?? {};
        if ("error" in result && result.error) {
          setError(result.error);
          return;
        }
        if ("notice" in result && result.notice) {
          setNotice(result.notice);
        }
        if ("success" in result && result.success) {
          setSuccess(true);
          if (isSignUp) {
            confetti({
              particleCount: 70,
              spread: 75,
              origin: { y: 0.65 },
              colors: ["#22d3ee", "#2dd4bf", "#f8fafc"],
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setBusyAction("none");
      }
    },
    [isSignUp],
  );

  const onSubmitEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasSubmitted(true);

    if (!isEmailValid) {
      setError("Enter a valid email address.");
      return;
    }

    if (isSignUp && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    await runAction("email", () =>
      onEmailPasswordSubmit({ email: email.trim(), password }),
    );
  };

  const socialButtons = useMemo(() => {
    const hasSocial = Boolean(
      onGoogle || onApple || onFacebook || onPhone || onGithub,
    );
    if (!hasSocial) return null;
    const socialProviders = [
      {
        id: "google",
        label: "Continue with Google",
        action: onGoogle,
        icon: <GoogleIcon className="h-5 w-5" />,
      },
      {
        id: "apple",
        label: "Continue with Apple",
        action: onApple,
        icon: <AppleIcon className="h-5 w-5" />,
      },
      {
        id: "facebook",
        label: "Continue with Facebook",
        action: onFacebook,
        icon: <FacebookIcon className="h-5 w-5" />,
      },
      {
        id: "phone",
        label: "Continue with phone",
        action: onPhone,
        icon: <Smartphone className="h-5 w-5" />,
      },
      {
        id: "github",
        label: "Continue with GitHub",
        action: onGithub,
        icon: <GitHubIcon className="h-5 w-5" />,
      },
    ] satisfies SocialProviderButton[];
    const enabledProviders = socialProviders.filter((provider) =>
      Boolean(provider.action),
    );

    const renderSocialButton = (provider: SocialProviderButton) => (
      <GlassButton
        key={provider.id}
        type="button"
        size="icon"
        data-auth-social={provider.id}
        srLabel={provider.label}
        onClick={() =>
          provider.action ? runAction(provider.id, provider.action) : undefined
        }
        disabled={busyAction !== "none"}
        className="h-12 w-12 border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.035))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_12px_24px_-22px_rgba(0,0,0,0.82)] hover:border-primary/45 hover:bg-[linear-gradient(180deg,rgba(34,211,238,0.16),rgba(255,255,255,0.045))]"
        contentClassName="flex h-12 w-12 items-center justify-center p-0"
      >
        {busyAction === provider.id ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          provider.icon
        )}
      </GlassButton>
    );

    return (
      <div className="flex items-center justify-center gap-3">
        {enabledProviders.map((provider) => renderSocialButton(provider))}
      </div>
    );
  }, [busyAction, onApple, onFacebook, onGithub, onGoogle, onPhone, runAction]);

  return (
    <AuthBackdrop
      brandName={brandName}
      logo={logo}
      contentClassName="max-w-[30rem]"
    >
      <motion.div
        ref={cardRef}
        data-auth-card
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative mx-auto w-full max-w-[30rem] overflow-hidden rounded-[28px] border border-white/18 bg-[linear-gradient(180deg,rgba(15,23,32,0.74),rgba(7,12,20,0.66))] px-6 py-6 shadow-[0_18px_50px_-36px_rgba(0,0,0,0.64),inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-xl sm:px-7"
      >
        <span className="auth-card-ambient pointer-events-none hidden" />
        <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/28 to-transparent" />
        <div className="relative">
          {isSignUp && secondaryLinkHref ? (
            <div className="mb-4">
              <Link
                to={secondaryLinkHref}
                className="group inline-flex items-center gap-2 text-sm font-medium text-white/68 transition-[color,transform] duration-200 hover:-translate-x-0.5 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
                Back to sign in
              </Link>
            </div>
          ) : null}

          <div className="mb-6 flex justify-center">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.06))] px-4 py-3 shadow-[0_16px_36px_-26px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-2xl">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/16 bg-white/8">
                {logo}
              </span>
              <span className="auth-shell-title text-2xl font-semibold normal-case tracking-tight text-foreground">
                {displayBrandName}
              </span>
            </div>
          </div>

          <form onSubmit={onSubmitEmail} className="space-y-4">
            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Email
              <div
                className={getAuthFieldShellClassName({
                  active: Boolean(email),
                  invalid: hasSubmitted && !isEmailValid,
                })}
              >
                <Mail className="h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@repsync.com"
                  className="field-reset w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  autoComplete="email"
                  aria-invalid={hasSubmitted && !isEmailValid}
                />
              </div>
              {hasSubmitted && !isEmailValid ? (
                <span className="mt-2 block text-xs font-medium normal-case tracking-normal text-red-200">
                  Enter a valid workspace email.
                </span>
              ) : null}
            </label>

            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Password
              <div
                className={getAuthFieldShellClassName({
                  active: Boolean(password),
                })}
              >
                <Lock className="h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    isSignUp ? "At least 6 characters" : "Enter password"
                  }
                  className="field-reset w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  aria-invalid={hasSubmitted && isSignUp && password.length < 6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </label>

            <AnimatePresence>
              {isSignUp ? (
                <motion.label
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
                >
                  Confirm password
                  <div
                    className={getAuthFieldShellClassName({
                      active: Boolean(confirmPassword),
                      invalid:
                        hasSubmitted &&
                        isSignUp &&
                        Boolean(confirmPassword) &&
                        password !== confirmPassword,
                    })}
                  >
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      placeholder="Re-enter password"
                      className="field-reset w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                      autoComplete="new-password"
                      aria-invalid={
                        hasSubmitted && isSignUp && password !== confirmPassword
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </motion.label>
              ) : null}
            </AnimatePresence>

            {!isSignUp ? (
              <div className="flex justify-end text-sm">
                <Link
                  to="/support"
                  className="shrink-0 text-primary transition-colors hover:text-primary/80"
                >
                  Forgot Your Password?
                </Link>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-white/14 bg-[linear-gradient(180deg,rgba(120,29,29,0.28),rgba(120,29,29,0.14))] px-3 py-2.5 text-sm text-red-200 backdrop-blur-xl">
                <span className="inline-flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </span>
              </div>
            ) : null}

            {notice ? (
              <div className="rounded-xl border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.05))] px-3 py-2.5 text-sm text-muted-foreground backdrop-blur-xl">
                {notice}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-xl border border-white/14 bg-[linear-gradient(180deg,rgba(34,197,94,0.24),rgba(34,197,94,0.1))] px-3 py-2.5 text-sm text-emerald-100 backdrop-blur-xl">
                <span className="inline-flex items-center gap-2">
                  <PartyPopper className="h-4 w-4" />
                  Done. Redirecting...
                </span>
              </div>
            ) : null}

            <GlassButton
              type="submit"
              className="w-full border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.15),rgba(20,38,54,0.24)_48%,rgba(8,15,24,0.36))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(34,211,238,0.14),0_18px_38px_-30px_rgba(34,211,238,0.5)] hover:border-primary/45 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(26,48,68,0.28)_48%,rgba(10,20,31,0.4))]"
              disabled={busyAction !== "none"}
            >
              <span className="inline-flex items-center gap-2">
                {busyAction === "email" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {mainCtaLabel}
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </GlassButton>

            {secondaryLinkHref && secondaryLinkLabel ? (
              <Link
                to={secondaryLinkHref}
                className="auth-secondary-link group inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-transparent px-4 py-2.5 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {secondaryLinkLabel}
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            ) : null}
          </form>

          {socialButtons ? (
            <div className="mt-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Continue with
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
          ) : null}

          {socialButtons ? <div className="mt-3">{socialButtons}</div> : null}
        </div>
      </motion.div>
    </AuthBackdrop>
  );
}
