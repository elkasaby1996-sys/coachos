import type { ReactNode } from "react";
import {
  ArrowRight,
  ExternalLink,
  MapPin,
  Monitor,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import type { PTPublicLeadInput, PTPublicProfile } from "../../pt-hub/types";
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

export function PublicPtProfileView({
  profile,
  preview = false,
  submitting = false,
  success = false,
  onSubmitApplication,
}: {
  profile: PTPublicProfile;
  preview?: boolean;
  submitting?: boolean;
  success?: boolean;
  onSubmitApplication?: (input: PTPublicLeadInput) => Promise<void>;
}) {
  const title = profile.displayName || profile.fullName || "Coach";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_26%),radial-gradient(circle_at_top_right,rgba(37,99,235,0.1),transparent_20%),linear-gradient(180deg,rgba(7,10,18,1),rgba(10,15,26,1))] text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[36px] border border-border/70 bg-[linear-gradient(180deg,rgba(11,16,27,0.96),rgba(8,12,21,0.98))] shadow-[0_40px_120px_-60px_rgba(37,99,235,0.45)]">
          <div className="relative overflow-hidden border-b border-border/60">
            {profile.bannerImageUrl ? (
              <img
                src={profile.bannerImageUrl}
                alt={title}
                className="h-[280px] w-full object-cover opacity-85 sm:h-[320px]"
              />
            ) : (
              <div className="h-[280px] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.45),transparent_32%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.26),transparent_24%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(6,9,16,1))] sm:h-[320px]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <div className="flex flex-wrap items-end gap-5">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-border/70 bg-background/70 text-3xl font-semibold text-foreground shadow-[0_24px_60px_-40px_rgba(0,0,0,0.8)] sm:h-28 sm:w-28">
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {preview ? "Internal preview" : "Coach profile"}
                    </Badge>
                    {profile.marketplaceVisible ? (
                      <Badge variant="muted">Marketplace visible</Badge>
                    ) : (
                      <Badge variant="muted">Private discovery</Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
                      {title}
                    </h1>
                    <p className="max-w-3xl text-lg text-primary sm:text-xl">
                      {profile.headline}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    {profile.locationLabel ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-background/40 px-3 py-1.5">
                        <MapPin className="h-4 w-4" />
                        {profile.locationLabel}
                      </span>
                    ) : null}
                    {profile.availabilityModes.map((mode) => (
                      <span
                        key={mode}
                        className="inline-flex items-center gap-2 rounded-full bg-background/40 px-3 py-1.5"
                      >
                        <Monitor className="h-4 w-4" />
                        {availabilityLabels[mode] ?? mode}
                      </span>
                    ))}
                    {profile.coachingModes.map((mode) => (
                      <span
                        key={mode}
                        className="inline-flex items-center gap-2 rounded-full bg-background/40 px-3 py-1.5"
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

          <div className="grid gap-8 p-6 sm:p-8 xl:grid-cols-[minmax(0,1.15fr)_360px]">
            <div className="space-y-8">
              <section className="space-y-4">
                <SectionHeader
                  icon={<Sparkles className="h-4 w-4" />}
                  title="Overview"
                />
                <div className="rounded-[28px] bg-background/28 p-5 sm:p-6">
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

              <section className="space-y-4">
                <SectionHeader title="Positioning" />
                <div className="rounded-[28px] bg-background/28 p-5 sm:p-6">
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

              <section className="space-y-4">
                <SectionHeader
                  icon={<Star className="h-4 w-4" />}
                  title="Proof"
                />
                <div className="rounded-[28px] bg-background/28 p-5 sm:p-6">
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
                              className="rounded-[22px] bg-background/45 p-4"
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
                              key={`${item.title}-${item.summary}`}
                              className="rounded-[22px] bg-background/45 p-4"
                            >
                              <p className="text-sm font-medium text-foreground">
                                {item.title}
                              </p>
                              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                {item.summary}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <PlaceholderText text="Transformations will appear here once that proof system is built." />
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <div className="rounded-[28px] border border-primary/20 bg-primary/8 p-6">
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
                  <div className="rounded-[24px] bg-background/65 p-4">
                    <p className="text-sm font-medium text-foreground">
                      Apply to work with {title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Share your goals, training background, and budget so the
                      coach can review fit.
                    </p>
                    <div className="mt-4">
                      <PublicPtApplyForm
                        slug={profile.slug}
                        preview={preview}
                        submitting={submitting}
                        success={success}
                        onSubmit={onSubmitApplication}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] bg-background/28 p-6">
                <SectionHeader title="Social links" />
                <div className="mt-4 space-y-2">
                  {profile.socialLinks.length > 0 ? (
                    profile.socialLinks.map((link) => (
                      <a
                        key={link.platform}
                        href={preview ? undefined : link.url}
                        target={preview ? undefined : "_blank"}
                        rel={preview ? undefined : "noreferrer"}
                        className="flex items-center justify-between rounded-[20px] bg-background/45 px-4 py-3 transition hover:bg-background/65"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {link.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {link.url}
                          </p>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </a>
                    ))
                  ) : (
                    <PlaceholderText text="Public social links will show here once added in PT Hub." />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
    </div>
  );
}

function PlaceholderText({ text }: { text: string }) {
  return <p className="text-sm leading-6 text-muted-foreground">{text}</p>;
}
