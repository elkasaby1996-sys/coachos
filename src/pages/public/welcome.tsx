import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import gsap from "gsap";
import { ArrowRight, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { Button } from "../../components/ui/button";
import { AuthBackdrop } from "../../components/common/auth-backdrop";

export function WelcomePage() {
  const reduceMotion = useReducedMotion();
  const glowRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }

    const glow = glowRef.current;
    const card = cardRef.current;
    if (!glow || !card) {
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        glow,
        { xPercent: -8, yPercent: -4, scale: 0.96 },
        {
          xPercent: 10,
          yPercent: 6,
          scale: 1.06,
          duration: 8.4,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        },
      );

      gsap.fromTo(
        card,
        { y: 8 },
        {
          y: -8,
          duration: 6.8,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        },
      );
    });

    return () => ctx.revert();
  }, [reduceMotion]);

  return (
    <AuthBackdrop contentClassName="max-w-5xl">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className="relative mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]"
      >
        <div className="auth-shell-card relative overflow-hidden border border-border/70 bg-[linear-gradient(180deg,rgba(10,14,22,0.96),rgba(7,10,18,0.98))] p-8 sm:p-10">
          <div
            ref={glowRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[-18%] top-[-12%] h-56 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.2),rgba(56,189,248,0.04)_55%,transparent_72%)] blur-3xl"
          />
          <div className="relative z-10 space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Repsync system
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                Coaching that feels structured from day one.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
                Move from setup into real momentum with a workspace designed for
                PTs, clients, and public discovery to stay in sync.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: UsersRound,
                  title: "Coach + client clarity",
                  copy: "Training, nutrition, and accountability stay aligned.",
                },
                {
                  icon: ShieldCheck,
                  title: "Protected operations",
                  copy: "Guardrails, rate limits, and cleaner workflows are built in.",
                },
                {
                  icon: Sparkles,
                  title: "Premium feel",
                  copy: "Smoother transitions and stronger progress feedback across the app.",
                },
              ].map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                  animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + index * 0.08, duration: 0.38 }}
                  className="rounded-[24px] border border-white/8 bg-white/[0.04] p-4 backdrop-blur-xl"
                >
                  <item.icon className="h-4.5 w-4.5 text-primary" />
                  <p className="mt-3 text-sm font-semibold text-white">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-white/60">
                    {item.copy}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <motion.div
          ref={cardRef}
          initial={reduceMotion ? false : { opacity: 0, x: 18 }}
          animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
          transition={{ delay: 0.12, duration: 0.48, ease: "easeOut" }}
          className="auth-shell-card flex max-w-xl flex-col justify-between gap-6 border border-border/70 bg-[linear-gradient(180deg,rgba(14,18,28,0.92),rgba(10,13,21,0.96))] p-8"
        >
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="auth-shell-title text-3xl">Choose your path</h2>
            <p className="auth-shell-subtitle">
              Sign in if your workspace already exists, or create one to get
              started.
            </p>
          </div>

          <div className="space-y-3">
            <Button asChild className="h-12 w-full justify-between rounded-2xl">
              <Link to="/login">
                Sign in
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="h-12 w-full justify-between rounded-2xl"
            >
              <Link to="/signup">
                Sign up
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <p className="pt-2 text-center text-xs text-muted-foreground lg:text-left">
              Clients joining a coach should use their invite link.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AuthBackdrop>
  );
}
