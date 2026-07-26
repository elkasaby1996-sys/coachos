import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Globe,
  Instagram,
  Linkedin,
  MapPin,
  Youtube,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
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
  accountability: "Accountability",
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

const approachItems = [
  {
    title: "Start with context",
    body: "Training history, current routine, constraints, and goals shape the starting plan.",
  },
  {
    title: "Build the plan around real life",
    body: "Training, nutrition guidance, habits, and check-ins should be demanding enough to create progress and realistic enough to follow.",
  },
  {
    title: "Review what is actually happening",
    body: "Check-ins, messages, adherence, performance, and recovery context inform the next coaching decision.",
  },
  {
    title: "Adjust deliberately",
    body: "Changes should respond to evidence and feedback rather than constant program switching.",
  },
];

const experienceItems = [
  "Individual training program",
  "Nutrition guidance",
  "Habit targets",
  "Recurring check-ins",
  "Coach-client messaging",
  "Progress reviews",
  "Supported wearable context, when enabled",
];

const successSteps = [
  "Application submitted",
  "Coach reviews",
  "Coach may contact you",
  "Approval or decline",
];

function getExternalHref(url: string) {
  const value = url.trim();
  if (!value) return "#";
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  return `https://${value}`;
}

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "the coach";
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
  const firstName = getFirstName(title);
  const reduceMotion = useReducedMotion();
  const applyFormRef = useRef<HTMLDivElement | null>(null);
  const hasPackages = shouldRenderPublicPackagesSection(packageOptions);
  const [packagePrefill, setPackagePrefill] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const packageCards = useMemo(() => packageOptions, [packageOptions]);
  const modes = [
    ...profile.coachingModes.map((mode) => coachingModeLabels[mode] ?? mode),
    ...profile.availabilityModes.map(
      (mode) => availabilityLabels[mode] ?? mode,
    ),
  ];
  const locationLabel = profile.locationLabel || "Location shared by coach";
  const fitStatements =
    profile.specialties.length > 0
      ? profile.specialties.slice(0, 3).map((specialty) => ({
          title: specialty,
          body: `Built for clients looking for ${specialty.toLowerCase()} support with a structured coaching relationship.`,
        }))
      : [
          {
            title: "Clear goals",
            body: "Best for clients who can explain what they want coaching to help them improve.",
          },
          {
            title: "Consistent communication",
            body: "Built for clients willing to share training context, feedback, and constraints.",
          },
          {
            title: "Structured follow-through",
            body: "Useful when you want a coach to review progress and adjust the plan deliberately.",
          },
        ];

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
    <main className="min-h-screen bg-[#FBF9F1] text-[#171915]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Button
          asChild
          variant="ghost"
          className="mb-6 h-auto gap-2 px-0 text-[11px] font-bold uppercase tracking-[0.18em] text-[#285D49] hover:bg-transparent hover:text-[#1f4939]"
        >
          <a href="/coaches">
            <ArrowLeft className="h-4 w-4" />
            Back to coach marketplace
          </a>
        </Button>

        {preview && previewStatusBadges.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {previewStatusBadges.map((badge) => (
              <Badge key={badge.label} variant={badge.tone ?? "info"}>
                {badge.label}
              </Badge>
            ))}
          </div>
        ) : null}

        <motion.section
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="relative isolate overflow-hidden border-y border-[#285D49]/20 px-4 py-10 sm:px-8 lg:px-12 lg:py-16"
        >
          {profile.bannerImageUrl ? (
            <img
              src={profile.bannerImageUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 -z-20 h-full w-full object-cover"
            />
          ) : null}
          <div
            className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(251,249,241,0.96)_0%,rgba(251,249,241,0.9)_45%,rgba(251,249,241,0.42)_72%,rgba(251,249,241,0.78)_100%)]"
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_20%,rgba(40,93,73,0.22),transparent_32%)]"
            aria-hidden="true"
          />

          <div className="max-w-3xl space-y-7">
            <div className="space-y-4">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                {profile.profilePhotoUrl ? (
                  <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[8px] border border-[#285D49]/18 bg-[#FBF9F1] shadow-[0_24px_62px_-42px_rgba(15,38,29,0.5)] sm:h-32 sm:w-32 lg:h-36 lg:w-36">
                    <img
                      src={profile.profilePhotoUrl}
                      alt={`${title} display photo`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
                <h1 className="font-serif text-5xl font-semibold leading-[0.96] tracking-normal text-[#0F261D] sm:text-6xl lg:text-7xl">
                  {title}
                </h1>
              </div>
              {profile.headline ? (
                <p className="max-w-2xl text-2xl font-semibold leading-tight text-[#171915]">
                  {profile.headline}
                </p>
              ) : null}
              {profile.shortBio ? (
                <p className="max-w-2xl text-base leading-7 text-[#43514B]">
                  {profile.shortBio}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-[#43514B]">
              {modes.length > 0 ? <span>{modes.join(" · ")}</span> : null}
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4 text-[#285D49]" />
                {locationLabel}
              </span>
            </div>

            {profile.specialties.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.specialties.slice(0, 6).map((specialty) => (
                  <Badge
                    key={specialty}
                    className="rounded-full border-[#285D49]/20 bg-[#E2EFE8] px-3 py-1 text-[#285D49]"
                  >
                    {specialty}
                  </Badge>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                className="bg-[#07543F] text-[#FBF9F1] hover:bg-[#0A3F31]"
                onClick={() =>
                  applyFormRef.current?.scrollIntoView({
                    behavior: reduceMotion ? "auto" : "smooth",
                    block: "start",
                  })
                }
              >
                Apply to work with {firstName}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                asChild
                variant="secondary"
                className="border border-[#285D49]/30 bg-transparent text-[#0F261D] hover:bg-white/70"
              >
                <a href="#coaching-options">View coaching options</a>
              </Button>
            </div>
          </div>
        </motion.section>

        <div className="grid gap-12 py-12 lg:grid-cols-[minmax(0,0.76fr)_minmax(0,1fr)] lg:py-16">
          <SectionIntro eyebrow="About" title={`Meet ${firstName}.`} />
          <div className="space-y-5">
            <p className="text-lg leading-8 text-[#43514B]">
              {profile.shortBio ||
                `${firstName}'s public biography will appear here once the coach publishes it.`}
            </p>
            {profile.socialLinks.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.socialLinks.map((link) => {
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
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#285D49]/18 bg-white/72 px-4 text-sm font-semibold text-[#285D49] transition hover:border-[#285D49]/35 hover:bg-white"
                    >
                      <PlatformIcon className="h-4 w-4" />
                      {link.label}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <section className="border-t border-[#285D49]/16 py-12 lg:py-16">
          <SectionIntro
            eyebrow="Coaching fit"
            title="Who this coaching is built for."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {fitStatements.map((item) => (
              <InfoPanel key={item.title} title={item.title} body={item.body} />
            ))}
          </div>
          <p className="mt-6 max-w-3xl border-l-2 border-[#285D49] pl-4 text-sm font-medium leading-6 text-[#43514B]">
            The application gives both you and {firstName} a chance to decide
            whether the coaching relationship is appropriate.
          </p>
        </section>

        <section className="border-t border-[#285D49]/16 py-12 lg:py-16">
          <SectionIntro eyebrow="Approach" title={`How ${firstName} coaches.`} />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {approachItems.map((item) => (
              <InfoPanel key={item.title} title={item.title} body={item.body} />
            ))}
          </div>
        </section>

        <section className="border-t border-[#285D49]/16 py-12 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]">
            <SectionIntro
              eyebrow="The experience"
              title="What working together may include."
            />
            <div>
              <div className="grid gap-3 sm:grid-cols-2">
                {experienceItems.map((item) => (
                  <div
                    key={item}
                    className="flex min-h-14 items-center gap-3 rounded-[8px] border border-[#285D49]/14 bg-white/72 px-4 text-sm font-semibold text-[#26332E]"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#285D49]" />
                    {item}
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-6 text-[#43514B]">
                The exact combination depends on the coaching option you apply
                for and the plan agreed after approval.
              </p>
              <Button
                asChild
                variant="ghost"
                className="mt-2 px-0 text-[#285D49] hover:bg-transparent"
              >
                <a href="/for-clients">
                  See the RepSync client experience
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section
          id="coaching-options"
          className="border-t border-[#285D49]/16 py-12 lg:py-16"
        >
          <SectionIntro
            eyebrow="Coaching options"
            title="Choose the option closest to what you need."
            body="Review the public options, then use the application to describe your goals and confirm your interest. Applying does not create a subscription or guarantee acceptance."
          />
          <div
            className={hasPackages ? "mt-8 hidden lg:block" : "mt-8"}
            data-testid={hasPackages ? "packages-section-desktop" : undefined}
          >
            <PublicPackageSection
              packageOptions={packageCards}
              onApply={handleApplyForPackage}
              reduceMotion={Boolean(reduceMotion)}
              coachFirstName={firstName}
            />
          </div>
          {hasPackages ? (
            <div className="mt-8 lg:hidden" data-testid="packages-section-mobile">
              <PublicPackageSection
                packageOptions={packageCards}
                onApply={handleApplyForPackage}
                reduceMotion={Boolean(reduceMotion)}
                coachFirstName={firstName}
              />
            </div>
          ) : null}
        </section>

        <section className="border-t border-[#285D49]/16 py-12 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]">
            <SectionIntro
              eyebrow="Background"
              title="Credentials and coaching experience."
            />
            <div className="space-y-5">
              {profile.certifications.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.certifications.map((credential) => (
                    <Badge
                      key={credential}
                      variant="secondary"
                      className="rounded-full border-[#285D49]/18 bg-white/74 px-3 py-1 text-[#285D49]"
                    >
                      {credential}
                    </Badge>
                  ))}
                </div>
              ) : (
                <InfoPanel
                  title="Credentials supplied by coach"
                  body="Credentials and experience will appear here when they are added to the public profile."
                />
              )}
              {profile.coachingStyle ? (
                <p className="text-base leading-7 text-[#43514B]">
                  {profile.coachingStyle}
                </p>
              ) : null}
              <p className="border-l-2 border-[#285D49] pl-4 text-sm leading-6 text-[#43514B]">
                Credentials and experience are supplied by the coach unless
                explicitly marked as verified by RepSync.
              </p>
            </div>
          </div>
        </section>

        <section
          ref={applyFormRef}
          id="public-pt-apply-form"
          className="border-t border-[#285D49]/16 py-12 lg:py-16"
        >
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]">
            <SectionIntro
              eyebrow="Application"
              title={`Apply to work with ${title}.`}
              body="Share enough context for the coach to understand what you are looking for. Submitting this form does not create a subscription or confirm a coaching place."
            />
            <div className="rounded-[8px] border border-[#285D49]/18 bg-white/78 p-5 shadow-[0_28px_90px_-72px_rgba(40,93,73,0.55)] sm:p-6">
              {success ? (
                <SuccessPanel slug={profile.slug} firstName={firstName} />
              ) : null}
              <p className="mb-4 rounded-[6px] border border-[#285D49]/14 bg-[#FBF9F1] px-4 py-3 text-xs leading-5 text-[#43514B]">
                I understand that this application will be shared with the
                selected coach so they can review and respond.
              </p>
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
        </section>

        <section className="rounded-[8px] bg-[#285D49] px-6 py-10 text-[#FBF9F1] sm:px-8 lg:px-10">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C9DED3]">
                Still exploring?
              </p>
              <h2 className="mt-3 font-serif text-4xl font-semibold leading-tight">
                Return to the marketplace to compare coaching approaches,
                services, and availability.
              </h2>
            </div>
            <Button asChild variant="secondary">
              <a href="/coaches">
                Browse more coaches
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </section>

        <p className="mx-auto max-w-4xl py-8 text-center text-xs leading-6 text-[#66736E]">
          Profile information, credentials, services, availability, and pricing
          are supplied by the coach unless explicitly stated otherwise. RepSync
          does not guarantee coaching outcomes or replace medical advice.
        </p>
      </div>
    </main>
  );
}

function PublicPackageSection({
  packageOptions,
  onApply,
  reduceMotion = false,
  coachFirstName,
}: {
  packageOptions: PTPublicPackageOption[];
  onApply: (packageId: string) => void;
  reduceMotion?: boolean;
  coachFirstName: string;
}) {
  if (packageOptions.length === 0) {
    return (
      <InfoPanel
        title="Coaching options discussed after application"
        body={`Apply with your goals and ${coachFirstName} can confirm which coaching route is appropriate.`}
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {packageOptions.map((packageOption) => {
        const featureBullets = getPublicPackageFeatureBullets(packageOption);
        return (
          <motion.article
            key={packageOption.id}
            whileHover={
              reduceMotion
                ? undefined
                : {
                    y: -4,
                    boxShadow: "0 30px 74px -58px rgba(40, 93, 73, 0.5)",
                  }
            }
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="rounded-[8px] border border-[#285D49]/18 bg-white/78 p-5 transition-[border-color,background-color] hover:border-[#285D49]/35 hover:bg-white"
          >
            <h3 className="text-xl font-bold text-[#0F261D]">
              {packageOption.label}
            </h3>
            {packageOption.subtitle || packageOption.description ? (
              <p className="mt-3 text-sm leading-6 text-[#43514B]">
                {packageOption.subtitle || packageOption.description}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#285D49]">
              {packageOption.billingCadenceLabel ? (
                <span className="rounded-full border border-[#285D49]/18 px-3 py-1">
                  {packageOption.billingCadenceLabel}
                </span>
              ) : null}
              {packageOption.priceLabel ? (
                <span className="rounded-full border border-[#285D49]/18 px-3 py-1">
                  {packageOption.currencyCode &&
                  !packageOption.priceLabel
                    .toUpperCase()
                    .includes(packageOption.currencyCode.toUpperCase())
                    ? `${packageOption.priceLabel} ${packageOption.currencyCode}`
                    : packageOption.priceLabel}
                </span>
              ) : null}
            </div>
            {featureBullets.length > 0 ? (
              <ul className="mt-5 space-y-2 text-sm leading-6 text-[#43514B]">
                {featureBullets.map((feature) => (
                  <li key={`${packageOption.id}-${feature}`} className="flex gap-2">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#285D49]" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="mt-5 w-full justify-between border border-[#285D49]/30 bg-transparent text-[#0F261D] hover:bg-white/70"
              onClick={() => onApply(packageOption.id)}
            >
              Apply for {packageOption.label}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.article>
        );
      })}
    </div>
  );
}

function SuccessPanel({ slug, firstName }: { slug: string; firstName: string }) {
  return (
    <div className="mb-5 rounded-[8px] border border-[#285D49]/18 bg-[#E2EFE8] p-5">
      <h3 className="text-xl font-bold text-[#0F261D]">
        Your application has been sent to {firstName}.
      </h3>
      <p className="mt-2 text-sm leading-6 text-[#43514B]">
        {firstName} can now review your goals, experience, and coaching
        interest. This is not an acceptance or subscription.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {successSteps.map((step) => (
          <div
            key={step}
            className="flex items-center gap-2 rounded-[6px] bg-white/70 px-3 py-2 text-sm font-semibold text-[#285D49]"
          >
            <CheckCircle2 className="h-4 w-4" />
            {step}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          asChild
          variant="secondary"
          className="border border-[#285D49]/30 bg-transparent text-[#0F261D] hover:bg-white/70"
        >
          <a href={`/p/${slug}`}>Return to profile</a>
        </Button>
        <Button asChild variant="secondary">
          <a href="/coaches">Browse other coaches</a>
        </Button>
      </div>
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#285D49]">
        {eyebrow}
      </p>
      <h2 className="mt-3 font-serif text-4xl font-semibold leading-[1.02] text-[#0F261D] sm:text-5xl">
        {title}
      </h2>
      {body ? (
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[#43514B]">
          {body}
        </p>
      ) : null}
    </div>
  );
}

function InfoPanel({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-[8px] border border-[#285D49]/16 bg-white/72 p-5">
      <h3 className="text-lg font-bold text-[#0F261D]">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#43514B]">{body}</p>
    </article>
  );
}
