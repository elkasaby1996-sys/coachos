import React, { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  PartyPopper,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { AuthBackdrop } from "../common/auth-backdrop";

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
  onGithub?: () => Promise<AuthSubmitResult | void>;
}

const glassButtonVariants = cva(
  "relative isolate cursor-pointer rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-60",
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
      default: "px-5 py-3",
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
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, children, size, contentClassName, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "group relative overflow-hidden border border-border/70 bg-card/75 shadow-[0_10px_28px_-18px_oklch(var(--primary)/0.45)] backdrop-blur-md",
          glassButtonVariants({ size }),
          className,
        )}
        {...props}
      >
        <span className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <span
          className={cn(
            "relative z-10 text-foreground",
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

export function AuthComponent({
  mode,
  brandName = "CoachOS",
  logo = <DefaultLogo />,
  title,
  subtitle,
  primaryLabel,
  secondaryLinkHref,
  secondaryLinkLabel,
  onEmailPasswordSubmit,
  onGoogle,
  onGithub,
}: AuthComponentProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busyAction, setBusyAction] = useState<
    "none" | "email" | "google" | "github"
  >("none");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const isSignUp = mode === "signup";
  const headerTitle =
    title ?? (isSignUp ? "Create your account" : "Welcome back");
  const headerSubtitle =
    subtitle ??
    (isSignUp
      ? "Create your CoachOS account and continue to workspace setup."
      : "Sign in to manage clients and training plans.");
  const mainCtaLabel =
    primaryLabel ?? (isSignUp ? "Create account" : "Sign in");

  const runAction = useCallback(
    async (
      action: "email" | "google" | "github",
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

    if (!/\S+@\S+\.\S+/.test(email.trim())) {
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
    const hasSocial = Boolean(onGoogle || onGithub);
    if (!hasSocial) return null;

    return (
      <div
        className={cn(
          "grid w-full gap-3",
          onGoogle && onGithub ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
        )}
      >
        {onGoogle ? (
          <GlassButton
            type="button"
            onClick={() => runAction("google", onGoogle)}
            disabled={busyAction !== "none"}
            className="w-full"
          >
            <span className="inline-flex items-center gap-2">
              {busyAction === "google" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon className="h-4 w-4" />
              )}
              Continue with Google
            </span>
          </GlassButton>
        ) : null}

        {onGithub ? (
          <GlassButton
            type="button"
            onClick={() => runAction("github", onGithub)}
            disabled={busyAction !== "none"}
            className="w-full"
          >
            <span className="inline-flex items-center gap-2">
              {busyAction === "github" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GitHubIcon className="h-4 w-4" />
              )}
              Continue with GitHub
            </span>
          </GlassButton>
        ) : null}
      </div>
    );
  }, [busyAction, onGithub, onGoogle, runAction]);

  return (
    <AuthBackdrop
      brandName={brandName}
      logo={logo}
      contentClassName="max-w-[30rem]"
    >
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative z-10 w-full max-w-[30rem] rounded-2xl border border-border/70 bg-card/85 p-6 shadow-[0_30px_60px_-40px_oklch(var(--primary)/0.5)] backdrop-blur-xl"
      >
        <div className="mb-6 space-y-2 text-center">
          <h1 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            {headerTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{headerSubtitle}</p>
        </div>

        {socialButtons}

        {socialButtons ? (
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Or with email
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
        ) : null}

        <form onSubmit={onSubmitEmail} className="space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Email
            <div className="mt-1.5 flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-2.5">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@coachos.com"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                autoComplete="email"
              />
            </div>
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Password
            <div className="mt-1.5 flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-2.5">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  isSignUp ? "At least 6 characters" : "Enter password"
                }
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-muted-foreground hover:text-foreground"
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
                className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Confirm password
                <div className="mt-1.5 flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-2.5">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter password"
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="text-muted-foreground hover:text-foreground"
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

          {error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span className="inline-flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </span>
            </div>
          ) : null}

          {notice ? (
            <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {notice}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-xl border border-primary/50 bg-primary/10 px-3 py-2 text-sm text-primary">
              <span className="inline-flex items-center gap-2">
                <PartyPopper className="h-4 w-4" />
                Done. Redirecting...
              </span>
            </div>
          ) : null}

          <GlassButton
            type="submit"
            className="w-full"
            disabled={busyAction !== "none"}
          >
            <span className="inline-flex items-center gap-2">
              {busyAction === "email" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {mainCtaLabel}
              <ArrowRight className="h-4 w-4" />
            </span>
          </GlassButton>

          {secondaryLinkHref && secondaryLinkLabel ? (
            <a
              href={secondaryLinkHref}
              className="inline-flex w-full items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {secondaryLinkLabel}
            </a>
          ) : null}
        </form>
      </motion.div>
    </AuthBackdrop>
  );
}
