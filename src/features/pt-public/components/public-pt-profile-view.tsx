import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ExternalLink,
  Globe,
  Instagram,
  Linkedin,
  MapPin,
  Monitor,
  Users,
  Youtube,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import gsap from "gsap";
import { Badge } from "../../../components/ui/badge";
import type { BadgeVariant } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import type {
  PTPublicApplicantIdentity,
  PTPublicLeadInput,
  PTPublicPackageOption,
  PTPublicProfile,
} from "../../pt-hub/types";
import {
  getPublicPackageFeatureBullets,
  shouldRenderPublicPackagesSection,
} from "../lib/public-pt-package-ux";
import { PublicPtApplyForm } from "./public-pt-apply-form";

const coachingModeLabels: Record<string, string> = {
  one_on_one: "1:1 coaching",
  programming: "Programming",
  nutrition: "Nutrition",
  accountability: "Consultation",
};

const availabilityLabels: Record<string, string> = {
  online: "Online",
  in_person: "In-person",
};

const socialPlatformIcons = {
  website: Globe,
  instagram: Instagram,
  linkedin: Linkedin,
  youtube: Youtube,
} as const;

function getExternalHref(url: string) {
  const value = url.trim();
  if (!value) return "#";
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  return `https://${value}`;
}

export function PublicPtProfileView({
  profile,
  preview = false,
  submitting = false,
  success = false,
  applicantIdentity,
  packageOptions = [],
  onSubmitApplication,
  previewStatusBadges = [],
}: {
  profile: PTPublicProfile;
  preview?: boolean;
  submitting?: boolean;
  success?: boolean;
  applicantIdentity: PTPublicApplicantIdentity;
  packageOptions?: PTPublicPackageOption[];
  onSubmitApplication?: (input: PTPublicLeadInput) => Promise<void>;
  previewStatusBadges?: Array<{
    label: string;
    tone?: BadgeVariant;
  }>;
}) {
  const title = profile.displayName || profile.fullName || "Coach";
  const reduceMotion = useReducedMotion();
  const heroGlowRef = useRef<HTMLDivElement | null>(null);
  const profileCardRef = useRef<HTMLDivElement | null>(null);
  const applyFormRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const hasPackages = shouldRenderPublicPackagesSection(packageOptions);
  const [packagePrefill, setPackagePrefill] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const packageCards = useMemo(() => packageOptions, [packageOptions]);

  useEffect(() => {
    if (reduceMotion) {
      sectionRefs.current.forEach((section) => {
        if (!section) {
          return;
        }
        gsap.set(section, { opacity: 1, y: 0 });
      });
      return;
    }

    const heroGlow = heroGlowRef.current;
    const profileCard = profileCardRef.current;
    if (!heroGlow || !profileCard) {
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        heroGlow,
        { xPercent: -4, yPercent: -2, scale: 0.96 },
        {
          xPercent: 4,
          yPercent: 3,
          scale: 1.06,
          duration: 10,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        },
      );

      gsap.fromTo(
        profileCard,
        { y: 12, rotateX: 1.5 },
        {
          y: -10,
          rotateX: -1,
          duration: 7.5,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        },
      );

      sectionRefs.current.forEach((section, index) => {
        if (!section) {
          return;
        }

        gsap.fromTo(
          section,
          { y: 28, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            delay: 0.15 + index * 0.08,
            ease: "power2.out",
          },
        );
      });
    });

    return () => ctx.revert();
  }, [reduceMotion, hasPackages, packageCards.length]);

  const registerSection = (index: number) => (node: HTMLElement | null) => {
    sectionRefs.current[index] = node;
  };

  const handleApplyForPackage = (packageId: string) => {
    setPackagePrefill((prev) => ({
      id: packageId,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
    applyFormRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  return (
    <div className="min-h-screen text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="overflow-hidden rounded-[36px] border border-border/70 bg-card/82 shadow-[0_32px_100px_-68px_oklch(var(--primary)/0.42)] backdrop-blur-2xl"
        >
          <div className="relative overflow-hidden border-b border-border/60 bg-[linear-gradient(135deg,oklch(var(--card)/0.96),oklch(var(--secondary)/0.42))]">
            <div
              ref={heroGlowRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[-8%] top-[-18%] h-[22rem] rounded-full bg-[radial-gradient(circle,oklch(var(--primary)/0.18),oklch(var(--primary)/0.04)_58%,transparent_74%)] blur-3xl"
            />
            {preview && previewStatusBadges.length > 0 ? (
              <div className="absolute right-6 top-6 z-20 flex flex-wrap items-center justify-end gap-2 sm:right-8 sm:top-8">
                {previewStatusBadges.map((badge) => (
                  <Badge
                    key={badge.label}
                    variant={badge.tone ?? "info"}
                    className="rounded-full border border-border/70 bg-card/78 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground shadow-[0_18px_42px_-34px_oklch(var(--primary)/0.48),inset_0_1px_0_oklch(1_0_0/0.62)] backdrop-blur-3xl"
                  >
                    {badge.label}
                  </Badge>
                ))}
              </div>
            ) : null}
            {profile.bannerImageUrl ? (
              <img
                src={profile.bannerImageUrl}
                alt={title}
                className="h-[280px] w-full object-cover opacity-80 sm:h-[320px]"
              />
            ) : (
              <div className="h-[280px] bg-[radial-gradient(circle_at_top_left,oklch(var(--primary)/0.18),transparent_34%),radial-gradient(circle_at_top_right,oklch(var(--accent)/0.28),transparent_28%),linear-gradient(135deg,oklch(var(--card)/0.98),oklch(var(--secondary)/0.58))] sm:h-[320px]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/44 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <div className="flex flex-wrap items-end gap-5">
                <div
                  ref={profileCardRef}
                  className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-border/70 bg-card/86 text-3xl font-semibold text-foreground shadow-[0_24px_60px_-42px_oklch(var(--primary)/0.46)] backdrop-blur-xl sm:h-28 sm:w-28"
                >
                  {profile.profilePhotoUrl ? (
                    <img
                      src={profile.profilePhotoUrl}
                      alt={title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (title || "PT").slice(0, 2).toUpperCase()
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
                      {title}
                    </h1>
                    <p className="max-w-3xl text-lg font-medium text-muted-foreground sm:text-xl">
                      {profile.headline}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    {profile.locationLabel ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 shadow-[inset_0_1px_0_oklch(1_0_0/0.52)]">
                        <MapPin className="h-4 w-4" />
                        {profile.locationLabel}
                      </span>
                    ) : null}
                    {profile.availabilityModes.map((mode) => (
                      <span
                        key={mode}
                        className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 shadow-[inset_0_1px_0_oklch(1_0_0/0.52)]"
                      >
                        <Monitor className="h-4 w-4" />
                        {availabilityLabels[mode] ?? mode}
                      </span>
                    ))}
                    {profile.coachingModes.map((mode) => (
                      <span
                        key={mode}
                        className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 shadow-[inset_0_1px_0_oklch(1_0_0/0.52)]"
                      >
                        <Users className="h-4 w-4" />
                        {coachingModeLabels[mode] ?? mode}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_360px]">
            <div className="space-y-8">
              <section ref={registerSection(0)} className="space-y-4 opacity-0">
                <SectionHeader title="Overview" />
                <div className="rounded-[28px] border border-border/60 bg-card/68 p-5 shadow-[0_22px_70px_-58px_oklch(var(--primary)/0.38)] backdrop-blur-xl sm:p-6">
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        About
                      </p>
                      <p className="text-sm leading-7 text-muted-foreground sm:text-base">
                        {profile.shortBio}
                      </p>
                    </div>
                    <div className="space-y-3 border-t border-border/60 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Coaching style
                      </p>
                      <p className="text-sm leading-7 text-muted-foreground">
                        {profile.coachingStyle ||
                          "Coaching style details will appear here once they are added."}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section ref={registerSection(1)} className="space-y-4 opacity-0">
                <SectionHeader title="Positioning" />
                <div className="rounded-[28px] border border-border/60 bg-card/68 p-5 shadow-[0_22px_70px_-58px_oklch(var(--primary)/0.38)] backdrop-blur-xl sm:p-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Specialties
                      </p>
                      {profile.specialties.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {profile.specialties.map((item) => (
                            <Badge key={item}>{item}</Badge>
                          ))}
                        </div>
                      ) : (
                        <PlaceholderText text="Specialties will appear here once they are added." />
                      )}
                    </div>

                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Certifications
                      </p>
                      {profile.certifications.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {profile.certifications.map((item) => (
                            <Badge key={item} variant="secondary">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <PlaceholderText text="Certifications will appear here once they are added." />
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {hasPackages ? (
                <section
                  ref={registerSection(2)}
                  className="hidden space-y-4 opacity-0 lg:block"
                  data-testid="packages-section-desktop"
                >
                  <PublicPackageSection
                    packageOptions={packageCards}
                    onApply={handleApplyForPackage}
                    reduceMotion={Boolean(reduceMotion)}
                  />
                </section>
              ) : null}

              <section ref={registerSection(3)} className="space-y-4 opacity-0">
                <SectionHeader title="Proof" />
                <div className="rounded-[28px] border border-border/60 bg-card/68 p-5 shadow-[0_22px_70px_-58px_oklch(var(--primary)/0.38)] backdrop-blur-xl sm:p-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Testimonials
                      </p>
                      {profile.testimonials.length > 0 ? (
                        <div className="space-y-3">
                          {profile.testimonials.map((testimonial) => (
                            <div
                              key={`${testimonial.author}-${testimonial.quote}`}
                              className="rounded-[22px] border border-border/55 bg-background/52 p-4"
                            >
                              <p className="text-sm text-foreground">
                                "{testimonial.quote}"
                              </p>
                              <p className="mt-3 text-xs text-muted-foreground">
                                {testimonial.author}
                                {testimonial.role
                                  ? ` - ${testimonial.role}`
                                  : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <PlaceholderText text="Testimonials will land here once proof modules are added." />
                      )}
                    </div>

                    <div className="space-y-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Transformations
                      </p>
                      {profile.transformations.length > 0 ? (
                        <div className="space-y-3">
                          {profile.transformations.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-[22px] border border-border/55 bg-background/52 p-4"
                            >
                              {item.beforeImageUrl || item.afterImageUrl ? (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <TransformationImage
                                    label="Before"
                                    src={item.beforeImageUrl}
                                    title={item.title}
                                  />
                                  <TransformationImage
                                    label="After"
                                    src={item.afterImageUrl}
                                    title={item.title}
                                  />
                                </div>
                              ) : null}
                              {item.title ? (
                                <p className="mt-3 text-sm font-medium text-foreground">
                                  {item.title}
                                </p>
                              ) : null}
                              {item.summary ? (
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                  {item.summary}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <PlaceholderText text="Transformation stories will show here once you add them in PT Hub." />
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              {hasPackages ? (
                <section
                  ref={registerSection(4)}
                  className="space-y-4 opacity-0 lg:hidden"
                  data-testid="packages-section-mobile"
                >
                  <PublicPackageSection
                    packageOptions={packageCards}
                    onApply={handleApplyForPackage}
                    reduceMotion={Boolean(reduceMotion)}
                  />
                </section>
              ) : null}

              <div
                ref={(node) => {
                  registerSection(5)(node);
                  applyFormRef.current = node;
                }}
                className="rounded-[28px] border border-primary/25 bg-card/76 p-6 opacity-0 shadow-[0_24px_80px_-58px_oklch(var(--primary)/0.44)] backdrop-blur-xl"
                id="public-pt-apply-form"
              >
                <p className="text-sm font-medium text-primary">
                  Work with {title}
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                  Built to convert interest into a real application.
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  This page is powered directly from PT Hub content and is
                  designed to move prospects from trust to inquiry.
                </p>
                <div className="mt-5 grid gap-3">
                  <Button className="justify-between" disabled>
                    Pricing inquiry
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <div className="rounded-[24px] border border-border/55 bg-background/60 p-4">
                    <p className="text-sm font-medium text-foreground">
                      Apply to work with {title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Share your goals, training background, and package
                      preference so the coach can review fit.
                    </p>
                    <div className="mt-4">
                      <PublicPtApplyForm
                        slug={profile.slug}
                        preview={preview}
                        submitting={submitting}
                        success={success}
                        identity={applicantIdentity}
                        packageOptions={packageCards}
                        packagePrefill={packagePrefill}
                        onSubmit={onSubmitApplication}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div
                ref={registerSection(6)}
                className="rounded-[28px] border border-border/60 bg-card/68 p-6 opacity-0 shadow-[0_22px_70px_-58px_oklch(var(--primary)/0.38)] backdrop-blur-xl"
              >
                <SectionHeader title="Social links" />
                <div className="mt-4 space-y-2">
                  {profile.socialLinks.length > 0 ? (
                    profile.socialLinks.map((link) =>
                      (() => {
                        const PlatformIcon =
                          socialPlatformIcons[
                            link.platform as keyof typeof socialPlatformIcons
                          ] ?? Globe;

                        return (
                          <a
                            key={link.platform}
                            href={getExternalHref(link.url)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between rounded-[20px] border border-border/55 bg-background/52 px-4 py-3 transition hover:border-primary/35 hover:bg-background/72"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card/72 text-primary">
                                <PlatformIcon className="h-4 w-4" />
                              </div>
                              <p className="text-sm font-medium text-foreground">
                                {link.label}
                              </p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground" />
                          </a>
                        );
                      })(),
                    )
                  ) : (
                    <PlaceholderText text="Public social links will show here once added in PT Hub." />
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function PublicPackageSection({
  packageOptions,
  onApply,
  reduceMotion = false,
}: {
  packageOptions: PTPublicPackageOption[];
  onApply: (packageId: string) => void;
  reduceMotion?: boolean;
}) {
  return (
    <>
      <SectionHeader title="Packages" />
      <div className="rounded-[28px] border border-border/60 bg-card/68 p-5 shadow-[0_22px_70px_-58px_oklch(var(--primary)/0.38)] backdrop-blur-xl sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          {packageOptions.map((packageOption) => {
            const featureBullets =
              getPublicPackageFeatureBullets(packageOption);
            const hasFeatureBullets = featureBullets.length > 0;
            return (
              <motion.article
                key={packageOption.id}
                whileHover={
                  reduceMotion
                    ? undefined
                    : {
                        y: -6,
                        scale: 1.01,
                        boxShadow:
                          "0 30px 74px -52px oklch(var(--primary) / 0.52)",
                      }
                }
                transition={{ duration: 0.24, ease: "easeOut" }}
                className="rounded-[24px] border border-border/65 bg-background/58 p-4 shadow-[0_20px_54px_-44px_oklch(var(--primary)/0.34)] transition-[border-color,background-color] duration-300 hover:border-primary/45 hover:bg-background/72"
              >
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-foreground">
                    {packageOption.label}
                  </h3>
                  {packageOption.subtitle ? (
                    <p className="text-sm leading-6 text-muted-foreground">
                      {packageOption.subtitle}
                    </p>
                  ) : null}
                  {packageOption.priceLabel ||
                  packageOption.billingCadenceLabel ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                      {packageOption.priceLabel ? (
                        <span className="rounded-full border border-border/70 bg-card/72 px-2.5 py-1">
                          {packageOption.currencyCode &&
                          !packageOption.priceLabel
                            .toUpperCase()
                            .includes(packageOption.currencyCode.toUpperCase())
                            ? `${packageOption.priceLabel} ${packageOption.currencyCode}`
                            : packageOption.priceLabel}
                        </span>
                      ) : null}
                      {packageOption.billingCadenceLabel ? (
                        <span className="rounded-full border border-border/70 bg-card/72 px-2.5 py-1">
                          {packageOption.billingCadenceLabel}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {hasFeatureBullets ? (
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {featureBullets.map((feature) => (
                      <li
                        key={`${packageOption.id}-${feature}`}
                        className="flex gap-2"
                      >
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                ) : packageOption.description ? (
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">
                    {packageOption.description}
                  </p>
                ) : null}

                <Button
                  type="button"
                  variant="secondary"
                  className="mt-4 w-full justify-between"
                  onClick={() => onApply(packageOption.id)}
                >
                  Apply for this package
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.article>
            );
          })}
        </div>
      </div>
    </>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
    </div>
  );
}

function PlaceholderText({ text }: { text: string }) {
  return <p className="text-sm leading-6 text-muted-foreground">{text}</p>;
}

function TransformationImage({
  label,
  src,
  title,
}: {
  label: string;
  src: string | null;
  title: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="overflow-hidden rounded-[18px] border border-border/60 bg-background/60">
        {src ? (
          <img
            src={src}
            alt={title ? `${title} ${label.toLowerCase()}` : label}
            className="h-44 w-full object-cover"
          />
        ) : (
          <div className="flex h-44 items-center justify-center text-xs text-muted-foreground">
            {label} photo not added yet
          </div>
        )}
      </div>
    </div>
  );
}
