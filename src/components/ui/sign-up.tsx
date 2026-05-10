import React, {
  Children,
  createContext,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { cva, type VariantProps } from "class-variance-authority";
import type {
  CreateTypes as ConfettiInstance,
  GlobalOptions as ConfettiGlobalOptions,
  Options as ConfettiOptions,
} from "canvas-confetti";
import confetti from "canvas-confetti";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader,
  Lock,
  Mail,
  PartyPopper,
  Phone,
  X,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useInView,
  type Transition,
  type Variants,
} from "framer-motion";
import { AppFooter } from "../common/app-footer";
import {
  AuthFlowBackground,
  authFooterClassName,
  authFooterContentClassName,
} from "../common/auth-backdrop";
import { cn } from "../../lib/utils";

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
  subtitle?: React.ReactNode;
  primaryLabel?: string;
  secondaryLinkLabel?: string;
  secondaryLinkHref?: string;
  preFields?: React.ReactNode;
  footer?: React.ReactNode;
  submitDisabled?: boolean;
  socialDisabled?: boolean;
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

type ConfettiApi = { fire: (options?: ConfettiOptions) => void };
export type ConfettiRef = ConfettiApi | null;
const ConfettiContext = createContext<ConfettiApi>({} as ConfettiApi);
void ConfettiContext;

const Confetti = forwardRef<
  ConfettiRef,
  React.ComponentPropsWithRef<"canvas"> & {
    options?: ConfettiOptions;
    globalOptions?: ConfettiGlobalOptions;
    manualstart?: boolean;
  }
>((props, ref) => {
  const {
    options,
    globalOptions = { resize: true, useWorker: true },
    manualstart = false,
    ...rest
  } = props;
  const instanceRef = useRef<ConfettiInstance | null>(null);
  const canvasRef = useCallback(
    (node: HTMLCanvasElement | null) => {
      if (node) {
        if (instanceRef.current) return;
        instanceRef.current = confetti.create(node, {
          ...globalOptions,
          resize: true,
        });
        return;
      }

      instanceRef.current?.reset();
      instanceRef.current = null;
    },
    [globalOptions],
  );
  const fire = useCallback(
    (opts: ConfettiOptions = {}) =>
      instanceRef.current?.({ ...options, ...opts }),
    [options],
  );
  const api = useMemo(() => ({ fire }), [fire]);

  useImperativeHandle(ref, () => api, [api]);
  useEffect(() => {
    if (!manualstart) fire();
  }, [fire, manualstart]);

  return <canvas ref={canvasRef} {...rest} />;
});
Confetti.displayName = "Confetti";

type TextLoopProps = {
  children: React.ReactNode[];
  className?: string;
  interval?: number;
  transition?: Transition;
  variants?: Variants;
  onIndexChange?: (index: number) => void;
  stopOnEnd?: boolean;
};

export function TextLoop({
  children,
  className,
  interval = 2,
  transition = { duration: 0.3 },
  variants,
  onIndexChange,
  stopOnEnd = false,
}: TextLoopProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const items = Children.toArray(children);

  useEffect(() => {
    const intervalMs = interval * 1000;
    const timer = window.setInterval(() => {
      setCurrentIndex((current) => {
        if (stopOnEnd && current === items.length - 1) {
          window.clearInterval(timer);
          return current;
        }

        const next = (current + 1) % items.length;
        onIndexChange?.(next);
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [interval, items.length, onIndexChange, stopOnEnd]);

  const motionVariants: Variants = {
    initial: { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -20, opacity: 0 },
  };

  return (
    <div className={cn("relative inline-block whitespace-nowrap", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={currentIndex}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
          variants={variants || motionVariants}
        >
          {items[currentIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

type BlurFadeProps = {
  children: React.ReactNode;
  className?: string;
  variant?: Variants;
  duration?: number;
  delay?: number;
  yOffset?: number;
  inView?: boolean;
  inViewMargin?: `${number}px` | `${number}%` | `${number}px ${number}px`;
  blur?: string;
};

function BlurFade({
  children,
  className,
  variant,
  duration = 0.4,
  delay = 0,
  yOffset = 6,
  inView = true,
  inViewMargin = "-50px",
  blur = "6px",
}: BlurFadeProps) {
  const ref = useRef(null);
  const inViewResult = useInView(ref, { once: true, margin: inViewMargin });
  const isInView = !inView || inViewResult;
  const defaultVariants: Variants = {
    hidden: { y: yOffset, opacity: 0, filter: `blur(${blur})` },
    visible: { y: -yOffset, opacity: 1, filter: "blur(0px)" },
  };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      exit="hidden"
      variants={variant || defaultVariants}
      transition={{ delay: 0.04 + delay, duration, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const glassButtonVariants = cva(
  "relative isolate all-unset cursor-pointer rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-55",
  {
    variants: {
      size: {
        default: "text-base font-medium",
        sm: "text-sm font-medium",
        lg: "text-lg font-medium",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { size: "default" },
  },
);

const glassButtonTextVariants = cva(
  "glass-button-text relative block select-none",
  {
    variants: {
      size: {
        default: "px-6 py-3.5",
        sm: "px-4 py-2",
        lg: "px-8 py-4",
        icon: "flex h-10 w-10 items-center justify-center",
      },
    },
    defaultVariants: { size: "default" },
  },
);

interface GlassButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants> {
  buttonClassName?: string;
  contentClassName?: string;
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  (
    { className, children, size, buttonClassName, contentClassName, ...props },
    ref,
  ) => (
    <div className={cn("glass-button-wrap relative rounded-full", className)}>
      <button
        className={cn(
          "glass-button relative z-10",
          glassButtonVariants({ size }),
          buttonClassName,
        )}
        ref={ref}
        {...props}
      >
        <span
          className={cn(glassButtonTextVariants({ size }), contentClassName)}
        >
          {children}
        </span>
      </button>
      <div className="glass-button-shadow pointer-events-none rounded-full" />
    </div>
  ),
);
GlassButton.displayName = "GlassButton";

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M21.6 12.2c0-.7-.1-1.3-.2-1.8h-9.2v3.5h5.3a4.5 4.5 0 0 1-1.9 2.9v2.3h3.1c1.8-1.7 2.9-4.1 2.9-6.9Z"
    />
    <path
      fill="currentColor"
      d="M12.2 21.8c2.6 0 4.8-.9 6.4-2.3l-3.1-2.3c-.9.6-2 1-3.3 1a5.8 5.8 0 0 1-5.5-4H3.5v2.4a9.6 9.6 0 0 0 8.7 5.2Z"
    />
    <path
      fill="currentColor"
      d="M6.7 14.1a5.7 5.7 0 0 1 0-3.7V8H3.5a9.6 9.6 0 0 0 0 8.6l3.2-2.5Z"
    />
    <path
      fill="currentColor"
      d="M12.2 6.3c1.4 0 2.7.5 3.7 1.5l2.7-2.7a9.3 9.3 0 0 0-6.4-2.5A9.6 9.6 0 0 0 3.5 8l3.2 2.4a5.8 5.8 0 0 1 5.5-4.1Z"
    />
  </svg>
);

const AppleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M16.4 12.8c0-2 1.6-3 1.7-3.1-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.7 0-1.6-.7-2.7-.7-1.4 0-2.7.8-3.4 2.1-1.5 2.5-.4 6.2 1 8.3.7 1 1.5 2.1 2.6 2.1 1 0 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.7s1.9-1 2.6-2c.8-1.2 1.1-2.3 1.1-2.4 0-.1-2.2-.9-2.4-3.4ZM14.4 6.8c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.3-.6.6-1 1.7-.9 2.7 1 .1 2-.4 2.6-1.1Z"
    />
  </svg>
);

const FacebookIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M14 8.1h2.1V4.5c-.4-.1-1.6-.2-3-.2-3 0-5 1.8-5 5.2v2.9H4.8v4h3.3v7.2h4v-7.2h3.3l.5-4h-3.8V9.9c0-1.2.3-1.8 1.9-1.8Z"
    />
  </svg>
);

const GitHubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
    <path
      fill="currentColor"
      d="M8 0C3.6 0 0 3.6 0 8c0 3.5 2.3 6.5 5.5 7.6.4.1.5-.2.5-.4v-1.5c-2 .4-2.5-.5-2.7-.9-.1-.2-.5-.9-.8-1.1-.3-.2-.7-.5 0-.5.6 0 1.1.6 1.2.8.7 1.2 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3s1.4.1 2 .3c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.8-3.7 4 .3.2.5.7.5 1.5v2.2c0 .2.2.5.6.4A8 8 0 0 0 8 0Z"
    />
  </svg>
);

const modalSteps = [
  {
    message: "Signing you up...",
    icon: <Loader className="h-12 w-12 animate-spin text-primary" />,
  },
  {
    message: "Onboarding you...",
    icon: <Loader className="h-12 w-12 animate-spin text-primary" />,
  },
  {
    message: "Finalizing...",
    icon: <Loader className="h-12 w-12 animate-spin text-primary" />,
  },
  {
    message: "Welcome aboard",
    icon: <PartyPopper className="h-12 w-12 text-green-500" />,
  },
];
const successModalStep = modalSteps[modalSteps.length - 1]!;
const TEXT_LOOP_INTERVAL = 1.1;

type AuthStep = "email" | "password" | "confirmPassword";
type ModalStatus = "closed" | "loading" | "error" | "success";

export function AuthComponent({
  mode,
  brandName = "RepSync",
  title,
  subtitle,
  primaryLabel,
  secondaryLinkHref,
  secondaryLinkLabel,
  preFields,
  footer,
  submitDisabled = false,
  socialDisabled = false,
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
  const [authStep, setAuthStep] = useState<AuthStep>("email");
  const [modalStatus, setModalStatus] = useState<ModalStatus>("closed");
  const [modalErrorMessage, setModalErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [hasFailedSignIn, setHasFailedSignIn] = useState(false);
  const [inlineSignInError, setInlineSignInError] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [legalConsentError, setLegalConsentError] = useState("");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [busySocial, setBusySocial] = useState<
    "google" | "apple" | "facebook" | "phone" | "github" | null
  >(null);
  const confettiRef = useRef<ConfettiRef>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);
  const isSignUp = mode === "signup";
  const isEmailValid = /\S+@\S+\.\S+/.test(email.trim());
  const isPasswordValid = password.length >= 6;
  const isConfirmPasswordValid = confirmPassword.length >= 6;
  const formIsLocked =
    modalStatus !== "closed" || isSubmittingEmail || Boolean(busySocial);
  const hasSocial = Boolean(
    onGoogle || onApple || onFacebook || onPhone || onGithub,
  );
  const showPasswordField = true;
  const showEmailContinue = false;
  const showSocialBlock = hasSocial && (!isSignUp || authStep === "email");
  const canSubmitSignUp = !submitDisabled && (!isSignUp || acceptedLegal);
  const canUseSocial = !socialDisabled && (!isSignUp || acceptedLegal);
  const heading =
    title ??
    (isSignUp
      ? authStep === "email"
        ? "Get started with us"
        : authStep === "password"
          ? "Create your password"
          : "One last step"
      : "Welcome back");
  const supportingCopy =
    subtitle === null
      ? null
      : (subtitle ??
        (isSignUp
          ? authStep === "email"
            ? "Create your account and keep your coaching work moving."
            : authStep === "password"
              ? "Your password must be at least 6 characters long."
              : "Confirm your password to continue."
          : "Sign in to manage coaching, clients, and check-ins."));

  const fireSideCanons = () => {
    const fire = confettiRef.current?.fire;
    if (!fire) return;

    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };
    fire({ ...defaults, particleCount: 50, origin: { x: 0, y: 1 }, angle: 60 });
    fire({
      ...defaults,
      particleCount: 50,
      origin: { x: 1, y: 1 },
      angle: 120,
    });
  };

  const closeModal = () => {
    setModalStatus("closed");
    setModalErrorMessage("");
  };

  const finishSubmit = async () => {
    if (isSignUp && !acceptedLegal) {
      setLegalConsentError(
        "Accept the Privacy policy and Terms of use to continue.",
      );
      return;
    }

    if (!isEmailValid) {
      if (!isSignUp) {
        setInlineSignInError("Enter a valid email address.");
        return;
      }
      setModalErrorMessage("Enter a valid email address.");
      setModalStatus("error");
      setAuthStep("email");
      return;
    }

    if (password.length < 6) {
      if (!isSignUp) {
        setInlineSignInError("Password must be at least 6 characters.");
        return;
      }
      setModalErrorMessage("Password must be at least 6 characters.");
      setModalStatus("error");
      setAuthStep("password");
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      setModalErrorMessage("Passwords do not match.");
      setModalStatus("error");
      return;
    }

    setNotice("");
    setInlineSignInError("");
    if (isSignUp) {
      setModalStatus("loading");
    } else {
      setIsSubmittingEmail(true);
    }

    try {
      const result =
        (await onEmailPasswordSubmit({ email: email.trim(), password })) ?? {};
      if (result.error) {
        if (!isSignUp) {
          setHasFailedSignIn(true);
          setInlineSignInError(result.error);
          return;
        }
        setModalErrorMessage(result.error);
        setModalStatus("error");
        return;
      }

      if (result.notice) setNotice(result.notice);
      if (result.success || result.notice) {
        window.setTimeout(
          () => {
            fireSideCanons();
            setModalStatus("success");
          },
          isSignUp ? 900 : 300,
        );
        return;
      }

      closeModal();
    } catch (error) {
      if (!isSignUp) {
        setHasFailedSignIn(true);
        setInlineSignInError(
          error instanceof Error ? error.message : "Something went wrong.",
        );
        return;
      }
      setModalErrorMessage(
        error instanceof Error ? error.message : "Something went wrong.",
      );
      setModalStatus("error");
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const handleProgressStep = () => {
    if (!isSignUp) {
      if (isEmailValid && !isPasswordValid) {
        passwordInputRef.current?.focus();
        return;
      }

      if (isEmailValid && isPasswordValid && canSubmitSignUp)
        void finishSubmit();
      return;
    }

    if (authStep === "email") {
      if (isEmailValid && !submitDisabled) {
        if (isSignUp) {
          if (isPasswordValid && isConfirmPasswordValid) void finishSubmit();
          else passwordInputRef.current?.focus();
          return;
        }
        setAuthStep("password");
      }
      return;
    }

    if (authStep === "password") {
      if (!isPasswordValid) return;
      if (isSignUp) setAuthStep("confirmPassword");
      else void finishSubmit();
    }
  };

  const handleFinalSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (formIsLocked) return;

    if (!isSignUp) {
      void finishSubmit();
      return;
    }

    if (isSignUp || authStep === "confirmPassword") {
      void finishSubmit();
      return;
    }

    handleProgressStep();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleProgressStep();
    }
  };

  const handleGoBack = () => {
    if (authStep === "confirmPassword") {
      setAuthStep("password");
      setConfirmPassword("");
      return;
    }

    if (authStep === "password") setAuthStep("email");
  };

  const runSocial = async (
    provider: "google" | "apple" | "facebook" | "phone" | "github",
    action: () => Promise<AuthSubmitResult | void>,
  ) => {
    if (socialDisabled || formIsLocked) return;

    if (isSignUp && !acceptedLegal) {
      setLegalConsentError(
        "Accept the Privacy policy and Terms of use to continue.",
      );
      return;
    }

    setBusySocial(provider);
    setNotice("");
    setLegalConsentError("");
    setModalStatus("loading");
    try {
      const result = (await action()) ?? {};
      if (result.error) {
        setModalErrorMessage(result.error);
        setModalStatus("error");
        return;
      }
      setNotice(result.notice ?? "");
      if (result.success) {
        fireSideCanons();
        setModalStatus("success");
      } else if (result.notice) {
        closeModal();
      } else {
        closeModal();
      }
    } catch (error) {
      setModalErrorMessage(
        error instanceof Error ? error.message : "Something went wrong.",
      );
      setModalStatus("error");
    } finally {
      setBusySocial(null);
    }
  };

  useEffect(() => {
    if (authStep === "password") {
      window.setTimeout(() => passwordInputRef.current?.focus(), 350);
    } else if (authStep === "confirmPassword") {
      window.setTimeout(() => confirmPasswordInputRef.current?.focus(), 350);
    }
  }, [authStep]);

  useEffect(() => {
    if (modalStatus === "success") fireSideCanons();
  }, [modalStatus]);

  const Modal = () => (
    <AnimatePresence>
      {modalStatus !== "closed" ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            className="relative flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border-4 border-border bg-card/85 p-8 text-center shadow-2xl backdrop-blur-2xl"
          >
            {modalStatus === "error" || modalStatus === "success" ? (
              <button
                onClick={closeModal}
                className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Close message"
              >
                <X className="h-5 w-5" />
              </button>
            ) : null}
            {modalStatus === "error" ? (
              <>
                <AlertCircle className="h-12 w-12 text-danger" />
                <p className="text-lg font-medium text-foreground">
                  {modalErrorMessage}
                </p>
                <GlassButton onClick={closeModal} size="sm" className="mt-4">
                  Try again
                </GlassButton>
              </>
            ) : null}
            {modalStatus === "loading" ? (
              <TextLoop interval={TEXT_LOOP_INTERVAL} stopOnEnd>
                {modalSteps.slice(0, -1).map((step) => (
                  <div
                    key={step.message}
                    className="flex flex-col items-center gap-4"
                  >
                    {step.icon}
                    <p className="text-lg font-medium text-foreground">
                      {isSignUp ? step.message : "Signing you in..."}
                    </p>
                  </div>
                ))}
              </TextLoop>
            ) : null}
            {modalStatus === "success" ? (
              <div className="flex flex-col items-center gap-4">
                {successModalStep.icon}
                <p className="text-lg font-medium text-foreground">
                  {notice || (isSignUp ? "Welcome aboard" : "Welcome back")}
                </p>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <div className="pt-hub-theme pt-hub-theme-light auth-flow-canvas relative isolate flex h-dvh w-full flex-col overflow-hidden text-foreground">
      <style>{`
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear { display: none !important; }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 30px transparent inset !important;
          -webkit-text-fill-color: oklch(var(--foreground)) !important;
          background-color: transparent !important;
          transition: background-color 5000s ease-in-out 0s !important;
          caret-color: oklch(var(--foreground)) !important;
        }
        @property --angle-1 { syntax: "<angle>"; inherits: false; initial-value: -75deg; }
        @property --angle-2 { syntax: "<angle>"; inherits: false; initial-value: -45deg; }
        .glass-button-wrap {
          --anim-time: 400ms;
          --anim-ease: cubic-bezier(0.25, 1, 0.5, 1);
          --border-width: clamp(1px, 0.0625em, 4px);
          position: relative;
          z-index: 2;
          transform-style: preserve-3d;
          transition: transform var(--anim-time) var(--anim-ease);
        }
        .glass-button-wrap:has(.glass-button:active) { transform: rotateX(25deg); }
        .glass-button-shadow {
          --shadow-cutoff-fix: 2em;
          position: absolute;
          width: calc(100% + var(--shadow-cutoff-fix));
          height: calc(100% + var(--shadow-cutoff-fix));
          top: calc(0% - var(--shadow-cutoff-fix) / 2);
          left: calc(0% - var(--shadow-cutoff-fix) / 2);
          filter: blur(clamp(2px, 0.125em, 12px));
          transition: filter var(--anim-time) var(--anim-ease);
          z-index: 0;
        }
        .glass-button-shadow::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: linear-gradient(180deg, oklch(from oklch(var(--foreground)) l c h / 20%), oklch(from oklch(var(--foreground)) l c h / 10%));
          width: calc(100% - var(--shadow-cutoff-fix) - 0.25em);
          height: calc(100% - var(--shadow-cutoff-fix) - 0.25em);
          top: calc(var(--shadow-cutoff-fix) - 0.5em);
          left: calc(var(--shadow-cutoff-fix) - 0.875em);
          padding: 0.125em;
          box-sizing: border-box;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          transition: all var(--anim-time) var(--anim-ease);
        }
        .glass-button {
          -webkit-tap-highlight-color: transparent;
          backdrop-filter: blur(clamp(1px, 0.125em, 4px));
          transition: all var(--anim-time) var(--anim-ease);
          background: linear-gradient(-75deg, oklch(from oklch(var(--background)) l c h / 5%), oklch(from oklch(var(--background)) l c h / 20%), oklch(from oklch(var(--background)) l c h / 5%));
          box-shadow:
            inset 0 0.125em 0.125em oklch(from oklch(var(--foreground)) l c h / 5%),
            inset 0 -0.125em 0.125em oklch(from oklch(var(--background)) l c h / 50%),
            0 0.25em 0.125em -0.125em oklch(from oklch(var(--foreground)) l c h / 20%),
            0 0 0.1em 0.25em inset oklch(from oklch(var(--background)) l c h / 20%);
        }
        .glass-button:hover {
          transform: scale(0.975);
          backdrop-filter: blur(0.01em);
        }
        .glass-button-text {
          color: oklch(from oklch(var(--foreground)) l c h / 90%);
          text-shadow: 0 0.25em 0.05em oklch(from oklch(var(--foreground)) l c h / 10%);
          transition: all var(--anim-time) var(--anim-ease);
        }
        .glass-button-text::after {
          content: "";
          display: block;
          position: absolute;
          width: calc(100% - var(--border-width));
          height: calc(100% - var(--border-width));
          top: calc(0% + var(--border-width) / 2);
          left: calc(0% + var(--border-width) / 2);
          border-radius: 9999px;
          overflow: clip;
          background: linear-gradient(var(--angle-2), transparent 0%, oklch(from oklch(var(--background)) l c h / 50%) 40% 50%, transparent 55%);
          z-index: 3;
          mix-blend-mode: screen;
          pointer-events: none;
          background-size: 200% 200%;
          background-position: 0% 50%;
          transition: background-position calc(var(--anim-time) * 1.25) var(--anim-ease), --angle-2 calc(var(--anim-time) * 1.25) var(--anim-ease);
        }
        .glass-button:hover .glass-button-text::after { background-position: 25% 50%; }
        .glass-button::after {
          content: "";
          position: absolute;
          z-index: 1;
          inset: 0;
          border-radius: 9999px;
          width: calc(100% + var(--border-width));
          height: calc(100% + var(--border-width));
          top: calc(0% - var(--border-width) / 2);
          left: calc(0% - var(--border-width) / 2);
          padding: var(--border-width);
          box-sizing: border-box;
          background:
            conic-gradient(from var(--angle-1) at 50% 50%, oklch(from oklch(var(--foreground)) l c h / 50%) 0%, transparent 5% 40%, oklch(from oklch(var(--foreground)) l c h / 50%) 50%, transparent 60% 95%, oklch(from oklch(var(--foreground)) l c h / 50%) 100%),
            linear-gradient(180deg, oklch(from oklch(var(--background)) l c h / 50%), oklch(from oklch(var(--background)) l c h / 50%));
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          transition: all var(--anim-time) var(--anim-ease), --angle-1 500ms ease;
          pointer-events: none;
        }
        .glass-button:hover::after { --angle-1: -125deg; }
        .glass-input-wrap {
          position: relative;
          z-index: 2;
          transform-style: preserve-3d;
          border-radius: 9999px;
        }
        .glass-input {
          display: flex;
          position: relative;
          min-height: 3rem;
          width: 100%;
          align-items: center;
          gap: 0;
          border-radius: 9999px;
          padding: 0.25rem 0.75rem;
          -webkit-tap-highlight-color: transparent;
          backdrop-filter: blur(clamp(1px, 0.125em, 4px));
          transition: all 400ms cubic-bezier(0.25, 1, 0.5, 1);
          background: linear-gradient(-75deg, oklch(from oklch(var(--background)) l c h / 5%), oklch(from oklch(var(--background)) l c h / 20%), oklch(from oklch(var(--background)) l c h / 5%));
          box-shadow:
            inset 0 0.125em 0.125em oklch(from oklch(var(--foreground)) l c h / 5%),
            inset 0 -0.125em 0.125em oklch(from oklch(var(--background)) l c h / 50%),
            0 0.25em 0.125em -0.125em oklch(from oklch(var(--foreground)) l c h / 20%),
            0 0 0.1em 0.25em inset oklch(from oklch(var(--background)) l c h / 20%);
        }
        .glass-input-wrap:focus-within .glass-input { backdrop-filter: blur(0.01em); }
        .glass-input::after {
          content: "";
          position: absolute;
          z-index: 1;
          inset: 0;
          border-radius: 9999px;
          width: calc(100% + clamp(1px, 0.0625em, 4px));
          height: calc(100% + clamp(1px, 0.0625em, 4px));
          top: calc(0% - clamp(1px, 0.0625em, 4px) / 2);
          left: calc(0% - clamp(1px, 0.0625em, 4px) / 2);
          padding: clamp(1px, 0.0625em, 4px);
          box-sizing: border-box;
          background:
            conic-gradient(from var(--angle-1) at 50% 50%, oklch(from oklch(var(--foreground)) l c h / 50%) 0%, transparent 5% 40%, oklch(from oklch(var(--foreground)) l c h / 50%) 50%, transparent 60% 95%, oklch(from oklch(var(--foreground)) l c h / 50%) 100%),
            linear-gradient(180deg, oklch(from oklch(var(--background)) l c h / 50%), oklch(from oklch(var(--background)) l c h / 50%));
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          transition: all 400ms cubic-bezier(0.25, 1, 0.5, 1), --angle-1 500ms ease;
          pointer-events: none;
        }
        .glass-input-wrap:focus-within .glass-input::after { --angle-1: -125deg; }
        .glass-input-single {
          border: 1px solid oklch(var(--border) / 0.72);
          background:
            linear-gradient(
              90deg,
              oklch(0.985 0.004 95 / 0.72),
              oklch(0.985 0.004 95 / 0.72)
            );
          box-shadow:
            inset 0 1px 0 oklch(1 0 0 / 0.52),
            0 10px 30px -24px oklch(var(--primary) / 0.62);
        }
        .glass-input-wrap:focus-within .glass-input-single {
          border-color: oklch(var(--primary) / 0.44);
          background:
            linear-gradient(
              90deg,
              oklch(0.99 0.004 95 / 0.82),
              oklch(0.99 0.004 95 / 0.82)
            );
          box-shadow:
            inset 0 1px 0 oklch(1 0 0 / 0.64),
            0 0 0 3px oklch(var(--primary) / 0.08),
            0 14px 36px -26px oklch(var(--primary) / 0.7);
        }
        .auth-flow-card-tall .glass-input-single {
          border-color: oklch(1 0 0 / 0.48);
          background:
            linear-gradient(
              90deg,
              oklch(1 0 0 / 0.16),
              oklch(1 0 0 / 0.1)
            );
          box-shadow:
            inset 0 1px 0 oklch(1 0 0 / 0.22),
            0 12px 28px -26px oklch(0 0 0 / 0.42);
        }
        .auth-flow-card-tall .glass-input-wrap:focus-within .glass-input-single {
          border-color: oklch(1 0 0 / 0.7);
          background:
            linear-gradient(
              90deg,
              oklch(1 0 0 / 0.22),
              oklch(1 0 0 / 0.13)
            );
          box-shadow:
            inset 0 1px 0 oklch(1 0 0 / 0.32),
            0 0 0 3px oklch(1 0 0 / 0.1),
            0 14px 32px -26px oklch(0 0 0 / 0.46);
        }
        .glass-input-single::after,
        .glass-input-single .glass-input-text-area,
        .glass-input-single .glass-input-text-area::after {
          display: none;
        }
        .glass-input-single input,
        .glass-input-single input:hover,
        .glass-input-single input:focus,
        .glass-input-single input:active {
          -webkit-appearance: none !important;
          appearance: none !important;
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          color-scheme: light !important;
          display: block !important;
          outline: none !important;
          filter: none !important;
          isolation: isolate !important;
          margin: 0 !important;
          padding: 0 !important;
          -webkit-tap-highlight-color: transparent !important;
        }
        .glass-input-single input:-webkit-autofill,
        .glass-input-single input:-webkit-autofill:hover,
        .glass-input-single input:-webkit-autofill:focus,
        .glass-input-single input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px transparent inset !important;
          -webkit-text-fill-color: oklch(var(--foreground)) !important;
          caret-color: oklch(var(--foreground)) !important;
          background-color: transparent !important;
          background-image: none !important;
          transition: background-color 9999s ease-out 0s !important;
        }
        .glass-input-text-area {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          pointer-events: none;
        }
        .glass-input-text-area::after {
          content: "";
          display: block;
          position: absolute;
          width: calc(100% - clamp(1px, 0.0625em, 4px));
          height: calc(100% - clamp(1px, 0.0625em, 4px));
          top: calc(0% + clamp(1px, 0.0625em, 4px) / 2);
          left: calc(0% + clamp(1px, 0.0625em, 4px) / 2);
          border-radius: 9999px;
          overflow: clip;
          background: linear-gradient(var(--angle-2), transparent 0%, oklch(from oklch(var(--background)) l c h / 50%) 40% 50%, transparent 55%);
          z-index: 3;
          mix-blend-mode: screen;
          pointer-events: none;
          background-size: 200% 200%;
          background-position: 0% 50%;
          transition: background-position 500ms cubic-bezier(0.25, 1, 0.5, 1), --angle-2 500ms cubic-bezier(0.25, 1, 0.5, 1);
        }
        .glass-input-wrap:focus-within .glass-input-text-area::after { background-position: 25% 50%; }
      `}</style>

      <AuthFlowBackground />

      <Confetti
        ref={confettiRef}
        manualstart
        className="pointer-events-none fixed left-0 top-0 z-[999] h-full w-full"
      />
      <Modal />

      <div className="auth-flow-brand fixed left-4 top-4 z-20 flex items-center md:left-1/2 md:-translate-x-1/2">
        <h1 className="text-xl font-bold tracking-normal text-foreground sm:text-2xl">
          {brandName}
        </h1>
      </div>

      <div className="auth-flow-scroll relative z-10 flex min-h-0 w-full flex-1 items-start justify-center overflow-y-auto px-4 py-16 sm:py-20">
        <fieldset
          disabled={formIsLocked}
          className={cn(
            "auth-flow-card relative z-10 mx-auto my-auto flex w-full flex-col items-center",
            isSignUp && preFields
              ? "max-w-[420px] rounded-[32px] border border-border/55 bg-card/62 px-6 py-5 shadow-[0_28px_90px_-54px_oklch(var(--primary)/0.58)] backdrop-blur-2xl sm:px-8 sm:py-6"
              : isSignUp
                ? "max-w-[340px] p-4 sm:max-w-[390px]"
                : "max-w-[420px] rounded-[32px] border border-border/55 bg-card/62 px-6 py-8 shadow-[0_28px_90px_-54px_oklch(var(--primary)/0.58)] backdrop-blur-2xl sm:px-8",
            preFields ? "gap-3" : isSignUp ? "gap-7" : "gap-5",
            isSignUp && preFields ? "auth-flow-card-tall" : null,
          )}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${authStep}-content`}
              initial={{ y: 6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={cn(
                "flex w-full flex-col items-center text-center",
                preFields ? "gap-2" : "gap-4",
              )}
            >
              <BlurFade className="w-full">
                <p
                  className={cn(
                    "whitespace-normal text-balance font-serif font-light tracking-tight text-foreground",
                    preFields
                      ? "text-[2.5rem] leading-[0.95] sm:text-[2.85rem]"
                      : !isSignUp
                        ? "text-4xl sm:text-5xl"
                        : "text-4xl sm:text-5xl",
                    preFields || !isSignUp ? null : "md:text-6xl",
                  )}
                >
                  {heading}
                </p>
              </BlurFade>
              {supportingCopy ? (
                <BlurFade delay={0.1}>
                  <p className="max-w-[20rem] text-sm font-medium leading-6 text-muted-foreground">
                    {supportingCopy}
                  </p>
                </BlurFade>
              ) : null}
            </motion.div>
          </AnimatePresence>

          <form
            onSubmit={handleFinalSubmit}
            className={cn(
              "w-full",
              isSignUp && preFields
                ? "space-y-3"
                : isSignUp
                  ? "space-y-4"
                  : "space-y-2",
            )}
          >
            {isSignUp && authStep === "email" && preFields ? (
              <BlurFade delay={0.08} className="w-full">
                <div className="border-b border-border/45 pb-3 text-left">
                  {preFields}
                </div>
              </BlurFade>
            ) : null}

            <AnimatePresence>
              {authStep !== "confirmPassword" ? (
                <motion.div
                  key="email-password-fields"
                  exit={{ opacity: 0, filter: "blur(4px)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className={cn(
                    "w-full",
                    isSignUp && preFields
                      ? "space-y-2.5"
                      : isSignUp
                        ? "space-y-3"
                        : "space-y-2",
                  )}
                >
                  <BlurFade
                    delay={authStep === "email" ? 0.1 : 0}
                    className="w-full"
                  >
                    <div className="relative w-full">
                      <AnimatePresence>
                        {isSignUp && authStep === "password" ? (
                          <motion.div
                            initial={{ y: -10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.2 }}
                            className="absolute -top-6 left-4 z-10"
                          >
                            <label className="text-xs font-semibold text-muted-foreground">
                              Email
                            </label>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                      <div className="glass-input-wrap w-full">
                        <div
                          className={cn("glass-input", "glass-input-single")}
                        >
                          <div
                            className={cn(
                              "relative z-10 flex shrink-0 items-center justify-center overflow-hidden transition-all duration-300 ease-in-out",
                              email.length > 20 && authStep === "email"
                                ? "w-0 px-0"
                                : "w-10 pl-2",
                            )}
                          >
                            <Mail className="h-5 w-5 shrink-0 text-foreground/80" />
                          </div>
                          <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(event) => {
                              setEmail(event.target.value);
                              if (!isSignUp) setInlineSignInError("");
                            }}
                            onKeyDown={handleKeyDown}
                            className={cn(
                              "relative z-10 h-full min-h-10 w-0 flex-grow appearance-none border-0 bg-transparent text-foreground shadow-none outline-none placeholder:text-foreground/60 focus:border-0 focus:outline-none focus:ring-0",
                              isEmailValid && showEmailContinue
                                ? "pr-2"
                                : "pr-0",
                            )}
                            autoComplete="email"
                            aria-label="Email"
                          />
                          <div
                            className={cn(
                              "relative z-10 shrink-0 overflow-hidden transition-all duration-300 ease-in-out",
                              isEmailValid &&
                                showEmailContinue &&
                                !submitDisabled
                                ? "w-10 pr-1"
                                : "w-0",
                            )}
                          >
                            <GlassButton
                              type="button"
                              onClick={handleProgressStep}
                              size="icon"
                              aria-label="Continue with email"
                              contentClassName="text-foreground/80 hover:text-foreground"
                            >
                              <ArrowRight className="h-5 w-5" />
                            </GlassButton>
                          </div>
                        </div>
                      </div>
                    </div>
                  </BlurFade>

                  <AnimatePresence>
                    {showPasswordField ? (
                      <BlurFade key="password-field" className="w-full">
                        <div className="relative w-full">
                          <AnimatePresence>
                            {isSignUp && password.length > 0 ? (
                              <motion.div
                                initial={{ y: -10, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ duration: 0.3 }}
                                className="absolute -top-6 left-4 z-10"
                              >
                                <label className="text-xs font-semibold text-muted-foreground">
                                  Password
                                </label>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                          <div className="glass-input-wrap w-full">
                            <div
                              className={cn(
                                "glass-input",
                                "glass-input-single",
                              )}
                            >
                              <div className="relative z-10 flex w-10 shrink-0 items-center justify-center pl-2">
                                {isPasswordValid ? (
                                  <button
                                    type="button"
                                    aria-label="Toggle password visibility"
                                    onClick={() =>
                                      setShowPassword(!showPassword)
                                    }
                                    className="rounded-full p-2 text-foreground/80 transition-colors hover:text-foreground"
                                  >
                                    {showPassword ? (
                                      <EyeOff className="h-5 w-5" />
                                    ) : (
                                      <Eye className="h-5 w-5" />
                                    )}
                                  </button>
                                ) : (
                                  <Lock className="h-5 w-5 shrink-0 text-foreground/80" />
                                )}
                              </div>
                              <input
                                ref={passwordInputRef}
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                value={password}
                                onChange={(event) => {
                                  setPassword(event.target.value);
                                  if (!isSignUp) setInlineSignInError("");
                                }}
                                onKeyDown={handleKeyDown}
                                className="relative z-10 h-full min-h-10 w-0 flex-grow appearance-none border-0 bg-transparent text-foreground shadow-none outline-none placeholder:text-foreground/60 focus:border-0 focus:outline-none focus:ring-0"
                                autoComplete={
                                  isSignUp ? "new-password" : "current-password"
                                }
                                aria-label="Password"
                              />
                              <div
                                className={cn(
                                  "relative z-10 shrink-0 overflow-hidden transition-all duration-300 ease-in-out",
                                  "w-0",
                                )}
                              >
                                <GlassButton
                                  type={isSignUp ? "button" : "submit"}
                                  disabled={
                                    submitDisabled ||
                                    (!isSignUp && !isEmailValid)
                                  }
                                  onClick={
                                    isSignUp ? handleProgressStep : undefined
                                  }
                                  size="icon"
                                  aria-label={
                                    primaryLabel ??
                                    (isSignUp ? "Submit password" : "Sign in")
                                  }
                                  contentClassName="text-foreground/80 hover:text-foreground"
                                >
                                  <ArrowRight className="h-5 w-5" />
                                </GlassButton>
                              </div>
                            </div>
                          </div>
                          {!isSignUp ? (
                            <AnimatePresence initial={false}>
                              {inlineSignInError ? (
                                <motion.p
                                  initial={{ opacity: 0, y: -3 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -3 }}
                                  transition={{
                                    duration: 0.18,
                                    ease: "easeOut",
                                  }}
                                  className="mt-1.5 flex items-center gap-1.5 pl-3 text-left text-xs font-normal leading-5 text-destructive"
                                  role="alert"
                                >
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                  <span>{inlineSignInError}</span>
                                </motion.p>
                              ) : null}
                            </AnimatePresence>
                          ) : null}
                        </div>
                      </BlurFade>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {isSignUp || authStep === "confirmPassword" ? (
                <BlurFade key="confirm-password-field" className="w-full">
                  <div className="relative w-full">
                    <AnimatePresence>
                      {confirmPassword.length > 0 ? (
                        <motion.div
                          initial={{ y: -10, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ duration: 0.3 }}
                          className="absolute -top-6 left-4 z-10"
                        >
                          <label className="text-xs font-semibold text-muted-foreground">
                            Confirm password
                          </label>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                    <div className="glass-input-wrap w-full">
                      <div className="glass-input glass-input-single">
                        <div className="relative z-10 flex w-10 shrink-0 items-center justify-center pl-2">
                          {isConfirmPasswordValid ? (
                            <button
                              type="button"
                              aria-label="Toggle confirm password visibility"
                              onClick={() =>
                                setShowConfirmPassword(!showConfirmPassword)
                              }
                              className="rounded-full p-2 text-foreground/80 transition-colors hover:text-foreground"
                            >
                              {showConfirmPassword ? (
                                <EyeOff className="h-5 w-5" />
                              ) : (
                                <Eye className="h-5 w-5" />
                              )}
                            </button>
                          ) : (
                            <Lock className="h-5 w-5 shrink-0 text-foreground/80" />
                          )}
                        </div>
                        <input
                          ref={confirmPasswordInputRef}
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Confirm password"
                          value={confirmPassword}
                          onChange={(event) =>
                            setConfirmPassword(event.target.value)
                          }
                          className="relative z-10 h-full min-h-10 w-0 flex-grow appearance-none border-0 bg-transparent text-foreground shadow-none outline-none placeholder:text-foreground/60 focus:border-0 focus:outline-none focus:ring-0"
                          autoComplete="new-password"
                          aria-label="Confirm password"
                        />
                        <div
                          className={cn(
                            "relative z-10 shrink-0 overflow-hidden transition-all duration-300 ease-in-out",
                            isConfirmPasswordValid ? "w-10 pr-1" : "w-0",
                          )}
                        >
                          <GlassButton
                            type="submit"
                            size="icon"
                            disabled={!canSubmitSignUp}
                            aria-label={primaryLabel ?? "Finish sign-up"}
                            contentClassName="text-foreground/80 hover:text-foreground"
                          >
                            <ArrowRight className="h-5 w-5" />
                          </GlassButton>
                        </div>
                      </div>
                    </div>
                  </div>
                  {!isSignUp ? (
                    <BlurFade inView delay={0.2}>
                      <button
                        type="button"
                        onClick={handleGoBack}
                        className="mt-4 flex items-center gap-2 rounded-full px-2 py-1 text-sm text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <ArrowLeft className="h-4 w-4" /> Go back
                      </button>
                    </BlurFade>
                  ) : null}
                </BlurFade>
              ) : null}
            </AnimatePresence>

            {isSignUp ? (
              <BlurFade delay={0.08} className="w-full">
                <div className="space-y-1.5">
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border/45 bg-card/45 px-3 py-2 text-left text-xs leading-5 text-muted-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.52)] backdrop-blur-xl transition-colors hover:border-primary/35 hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={acceptedLegal}
                      onChange={(event) => {
                        setAcceptedLegal(event.target.checked);
                        if (event.target.checked) setLegalConsentError("");
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border bg-background text-primary accent-[oklch(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                      aria-describedby={
                        legalConsentError
                          ? "auth-legal-consent-error"
                          : undefined
                      }
                    />
                    <span>
                      I agree to the{" "}
                      <Link
                        to="/privacy"
                        className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
                      >
                        Privacy policy
                      </Link>{" "}
                      and{" "}
                      <Link
                        to="/terms"
                        className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
                      >
                        Terms of use
                      </Link>
                      .
                    </span>
                  </label>
                  <AnimatePresence initial={false}>
                    {legalConsentError ? (
                      <motion.p
                        id="auth-legal-consent-error"
                        initial={{ opacity: 0, y: -3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -3 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="px-3 text-left text-xs font-normal leading-5 text-destructive"
                        role="alert"
                      >
                        {legalConsentError}
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                </div>
              </BlurFade>
            ) : null}

            {!isSignUp ? (
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {hasFailedSignIn ? (
                    <motion.div
                      initial={{ opacity: 0, y: -3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="flex justify-end"
                    >
                      <Link
                        to="/auth/forgot-password"
                        className="inline-flex rounded-full px-1 py-0.5 text-right text-xs font-normal text-foreground/60 transition-colors hover:text-foreground/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        Forgot your password?
                      </Link>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <GlassButton
                  type="submit"
                  size="sm"
                  disabled={
                    submitDisabled ||
                    isSubmittingEmail ||
                    !isEmailValid ||
                    !isPasswordValid
                  }
                  className="mx-auto w-full max-w-[10.75rem]"
                  buttonClassName="w-full"
                  contentClassName="flex w-full items-center justify-center gap-2"
                  aria-label={primaryLabel ?? "Sign in"}
                >
                  {isSubmittingEmail ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : null}
                  <span>
                    {isSubmittingEmail
                      ? "Signing in..."
                      : (primaryLabel ?? "Sign in")}
                  </span>
                  {!isSubmittingEmail ? (
                    <ArrowRight className="h-4 w-4" />
                  ) : null}
                </GlassButton>
              </div>
            ) : null}
          </form>

          {showSocialBlock ? (
            <div
              className={cn(
                "w-full",
                isSignUp ? "space-y-3" : "space-y-3 pt-1",
              )}
            >
              <BlurFade className="w-full">
                <div className="flex w-full items-center gap-2 py-1">
                  <hr className="w-full border-border" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    OR
                  </span>
                  <hr className="w-full border-border" />
                </div>
              </BlurFade>
              <BlurFade delay={0.1}>
                <div
                  className={cn(
                    "grid",
                    isSignUp ? "grid-cols-4 gap-2" : "grid-cols-2 gap-3",
                  )}
                >
                  {onGoogle ? (
                    <GlassButton
                      type="button"
                      onClick={() => void runSocial("google", onGoogle)}
                      size="sm"
                      className="w-full min-w-0"
                      buttonClassName="w-full min-w-0"
                      disabled={!canUseSocial || formIsLocked}
                      contentClassName={cn(
                        "flex items-center justify-center",
                        isSignUp ? "gap-1 px-2 py-2 text-xs" : "gap-2",
                      )}
                    >
                      {busySocial === "google" ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <GoogleIcon className="h-4 w-4 text-foreground/85" />
                      )}
                      <span className="font-semibold text-foreground">
                        Google
                      </span>
                    </GlassButton>
                  ) : null}
                  {onApple ? (
                    <GlassButton
                      type="button"
                      onClick={() => void runSocial("apple", onApple)}
                      size="sm"
                      className="w-full min-w-0"
                      buttonClassName="w-full min-w-0"
                      disabled={!canUseSocial || formIsLocked}
                      contentClassName={cn(
                        "flex items-center justify-center",
                        isSignUp ? "gap-1 px-2 py-2 text-xs" : "gap-2",
                      )}
                    >
                      {busySocial === "apple" ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <AppleIcon className="h-4 w-4 text-foreground/85" />
                      )}
                      <span className="font-semibold text-foreground">
                        Apple
                      </span>
                    </GlassButton>
                  ) : null}
                  {onFacebook ? (
                    <GlassButton
                      type="button"
                      onClick={() => void runSocial("facebook", onFacebook)}
                      size="sm"
                      className="w-full min-w-0"
                      buttonClassName="w-full min-w-0"
                      disabled={!canUseSocial || formIsLocked}
                      contentClassName={cn(
                        "flex items-center justify-center",
                        isSignUp ? "gap-1 px-2 py-2 text-xs" : "gap-2",
                      )}
                    >
                      {busySocial === "facebook" ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <FacebookIcon className="h-4 w-4 text-foreground/85" />
                      )}
                      <span className="font-semibold text-foreground">
                        {isSignUp ? "FB" : "Facebook"}
                      </span>
                    </GlassButton>
                  ) : null}
                  {onPhone ? (
                    <GlassButton
                      type="button"
                      onClick={() => void runSocial("phone", onPhone)}
                      size="sm"
                      className="w-full min-w-0"
                      buttonClassName="w-full min-w-0"
                      disabled={!canUseSocial || formIsLocked}
                      contentClassName={cn(
                        "flex items-center justify-center",
                        isSignUp ? "gap-1 px-2 py-2 text-xs" : "gap-2",
                      )}
                    >
                      {busySocial === "phone" ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <Phone className="h-4 w-4 text-foreground/85" />
                      )}
                      <span className="font-semibold text-foreground">
                        Phone
                      </span>
                    </GlassButton>
                  ) : null}
                  {onGithub ? (
                    <GlassButton
                      type="button"
                      onClick={() => void runSocial("github", onGithub)}
                      size="sm"
                      className="w-full min-w-0"
                      buttonClassName="w-full min-w-0"
                      disabled={!canUseSocial || formIsLocked}
                      contentClassName={cn(
                        "flex items-center justify-center",
                        isSignUp ? "gap-1 px-2 py-2 text-xs" : "gap-2",
                      )}
                    >
                      {busySocial === "github" ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <GitHubIcon
                          className={isSignUp ? "h-4 w-4" : "h-6 w-6"}
                        />
                      )}
                      <span className="font-semibold text-foreground">
                        GitHub
                      </span>
                    </GlassButton>
                  ) : null}
                </div>
              </BlurFade>
            </div>
          ) : null}

          {secondaryLinkHref && secondaryLinkLabel ? (
            <Link
              to={secondaryLinkHref}
              className="rounded-full px-3 py-1 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {secondaryLinkLabel}
            </Link>
          ) : null}

          {footer}
        </fieldset>
      </div>
      <AppFooter
        surface="transparent"
        className={authFooterClassName}
        contentClassName={authFooterContentClassName}
      />
    </div>
  );
}
