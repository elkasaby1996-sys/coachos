import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Dumbbell,
  Link2,
  MessageSquare,
  MousePointerClick,
  UserRound,
  UsersRound,
  Utensils,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { AppFooter } from "../../components/common/app-footer";
import {
  getPublicMarketingIntegrations,
  productLifecycleValues,
  productMediaAssets,
  productPageContent,
  productRoleLabels,
  visibleProductChapters,
  type MarketingIntegration,
  type ProductChapterContent,
  type ProductChapterId,
  type ProductMediaId,
} from "../../lib/product-page-content";
import { trackProductMarketingEvent } from "../../lib/marketing-analytics";
import { BloomField } from "./bloom-field";
import { usePublicSeo } from "./public-seo";
import {
  MarketingConsentBanner,
  PublicHeader,
  PublicMobileTrialBar,
} from "./public-site-shell";
import "../../styles/marketing-home.css";

const chapterIcons: Record<ProductChapterId, ReactNode> = {
  acquire: <MousePointerClick />,
  onboard: <UserRound />,
  training: <Dumbbell />,
  "nutrition-habits": <Utensils />,
  messaging: <MessageSquare />,
  "check-ins": <ClipboardCheck />,
  "client-attention": <AlertTriangle />,
  "operations-analytics": <BarChart3 />,
  "client-experience": <UserRound />,
  "team-access": <UsersRound />,
  integrations: <Link2 />,
};

const firstProductChapter = visibleProductChapters[0]!;

function getChapterFromHash(hash: string): ProductChapterId {
  const id = hash.replace(/^#/, "") as ProductChapterId;
  return visibleProductChapters.some((chapter) => chapter.id === id)
    ? id
    : firstProductChapter.id;
}

function scrollToChapter(id: ProductChapterId, behavior: ScrollBehavior) {
  document.getElementById(id)?.scrollIntoView({ behavior, block: "start" });
}

export function ProductPage() {
  const [activeChapter, setActiveChapter] = useState<ProductChapterId>(() =>
    typeof window === "undefined"
      ? firstProductChapter.id
      : getChapterFromHash(window.location.hash),
  );

  usePublicSeo(productPageContent.metadata);

  const reduceMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const navigateToChapter = useCallback(
    (id: ProductChapterId, source: "sidebar" | "mobile" | "module") => {
      const hash = `#${id}`;
      if (window.location.hash !== hash) {
        window.history.pushState({ productChapter: id }, "", hash);
      }
      setActiveChapter(id);
      scrollToChapter(id, reduceMotion ? "auto" : "smooth");
      trackProductMarketingEvent("product_chapter_clicked", {
        chapterId: id,
        ctaLocation: source === "sidebar" ? "sidebar" : undefined,
      });
    },
    [reduceMotion],
  );

  useEffect(() => {
    trackProductMarketingEvent("product_page_viewed");

    const syncHash = () => {
      const chapter = getChapterFromHash(window.location.hash);
      setActiveChapter(chapter);
      if (window.location.hash) {
        window.requestAnimationFrame(() => scrollToChapter(chapter, "auto"));
      }
    };

    const sections = visibleProductChapters
      .map((chapter) => document.getElementById(chapter.id))
      .filter((section): section is HTMLElement => Boolean(section));
    let frame = 0;

    const updateCurrentChapter = () => {
      frame = 0;
      const marker = window.scrollY + Math.min(window.innerHeight * 0.34, 280);
      let current = firstProductChapter.id;
      for (const section of sections) {
        if (section.offsetTop <= marker)
          current = section.id as ProductChapterId;
      }
      setActiveChapter(current);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateCurrentChapter);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", syncHash);
    window.addEventListener("hashchange", syncHash);
    updateCurrentChapter();
    if (window.location.hash) syncHash();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", syncHash);
      window.removeEventListener("hashchange", syncHash);
    };
  }, []);

  const lastTrackedChapter = useRef<ProductChapterId | null>(null);
  useEffect(() => {
    if (lastTrackedChapter.current === activeChapter) return;
    lastTrackedChapter.current = activeChapter;
    trackProductMarketingEvent("product_chapter_viewed", {
      chapterId: activeChapter,
    });
  }, [activeChapter]);

  return (
    <div className="rs-stitch-site rs-product-deep rs-product-reference">
      <BloomField
        className="rs-site-bloom rs-product-reference__bloom"
        motionAmount={0.18}
        speed={0.2}
      />
      <a className="rs-stitch-skip" href="#main">
        Skip to content
      </a>
      <PublicHeader />
      <ProductMobileChapterSelector
        activeChapter={activeChapter}
        onChange={(id) => navigateToChapter(id, "mobile")}
      />
      <div className="rs-product-reference__shell">
        <ProductReferenceSideNav
          activeChapter={activeChapter}
          onNavigate={(id) => navigateToChapter(id, "sidebar")}
        />
        <main className="rs-product-reference__main" id="main">
          <ProductReferenceHero />
          <ProductReferenceModuleMap
            onNavigate={(id) => navigateToChapter(id, "module")}
          />
          {visibleProductChapters.map((chapter) => (
            <ProductChapter chapter={chapter} key={chapter.id} />
          ))}
          <ProductReferenceCta />
        </main>
      </div>
      <AppFooter
        className="rs-marketing-app-footer"
        contentClassName="rs-marketing-app-footer__content"
        linkSet="marketing"
      />
      <PublicMobileTrialBar />
      <MarketingConsentBanner />
    </div>
  );
}

function ProductReferenceSideNav({
  activeChapter,
  onNavigate,
}: {
  activeChapter: ProductChapterId;
  onNavigate: (id: ProductChapterId) => void;
}) {
  return (
    <aside className="rs-product-ref-side" aria-label="Product chapters">
      <nav aria-label="Product deep-dive chapters">
        {visibleProductChapters.map((chapter) => (
          <a
            aria-current={activeChapter === chapter.id ? "location" : undefined}
            className={activeChapter === chapter.id ? "is-active" : ""}
            href={`#${chapter.id}`}
            key={chapter.id}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(chapter.id);
            }}
          >
            <span className="rs-product-ref-side__node" aria-hidden="true" />
            <span className="rs-product-ref-side__chapter">
              {chapter.navLabel}
            </span>
          </a>
        ))}
      </nav>
    </aside>
  );
}

function ProductMobileChapterSelector({
  activeChapter,
  onChange,
}: {
  activeChapter: ProductChapterId;
  onChange: (id: ProductChapterId) => void;
}) {
  return (
    <div className="rs-product-ref-mobile-selector">
      <label htmlFor="product-chapter-selector">Product chapters</label>
      <select
        aria-label="Current product chapter"
        id="product-chapter-selector"
        onChange={(event) => onChange(event.target.value as ProductChapterId)}
        value={activeChapter}
      >
        {visibleProductChapters.map((chapter) => (
          <option key={chapter.id} value={chapter.id}>
            {chapter.number} / {chapter.navLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

function ProductReferenceHero() {
  const hero = productPageContent.hero;
  return (
    <section className="rs-product-ref-hero" aria-labelledby="product-title">
      <SyncRail />
      <p className="rs-product-ref-label">{hero.eyebrow}</p>
      <h1 id="product-title">
        The Whole <em>Coaching Relationship</em>, Connected.
      </h1>
      <p>{hero.body}</p>
      <p className="rs-product-ref-hero__note">{hero.supportingCopy}</p>
      <div
        className="rs-product-ref-journey rs-product-ref-journey--eleven"
        aria-label="RepSync relationship journey"
      >
        {visibleProductChapters.map((chapter) => (
          <span key={chapter.id}>{chapter.navLabel}</span>
        ))}
      </div>
    </section>
  );
}

function ProductReferenceModuleMap({
  onNavigate,
}: {
  onNavigate: (id: ProductChapterId) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = visibleProductChapters[activeIndex] ?? firstProductChapter;
  const showPrevious = () =>
    setActiveIndex((index) =>
      index === 0 ? visibleProductChapters.length - 1 : index - 1,
    );
  const showNext = () =>
    setActiveIndex((index) => (index + 1) % visibleProductChapters.length);

  return (
    <section
      className="rs-product-ref-modules"
      aria-labelledby="product-module-map"
    >
      <div className="rs-product-ref-modules__intro">
        <p className="rs-product-ref-label">Operating system map</p>
        <h2 id="product-module-map">
          {visibleProductChapters.length} chapters. One coaching relationship.
        </h2>
        <p>
          Each chapter owns a clear part of the coaching operation, then keeps
          its context connected to what follows.
        </p>
      </div>
      <div className="rs-product-ref-module-carousel">
        <div className="rs-product-ref-module-carousel__viewport">
          <div
            className="rs-product-ref-module-carousel__track"
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {visibleProductChapters.map((chapter) => (
              <a
                className="rs-product-ref-module-slide"
                href={`#${chapter.id}`}
                key={chapter.id}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(chapter.id);
                }}
              >
                <span>{chapter.number}</span>
                {chapterIcons[chapter.id]}
                <h3>{chapter.navLabel}</h3>
                <p>{chapter.body}</p>
              </a>
            ))}
          </div>
        </div>
        <div className="rs-product-ref-module-carousel__controls">
          <button
            aria-label="Show previous chapter"
            onClick={showPrevious}
            type="button"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <p aria-live="polite">
            {active.number} / {active.navLabel}
          </p>
          <button
            aria-label="Show next chapter"
            onClick={showNext}
            type="button"
          >
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div
          className="rs-product-ref-module-carousel__dots"
          aria-label="Product chapters"
        >
          {visibleProductChapters.map((chapter, index) => (
            <button
              aria-current={activeIndex === index ? "true" : undefined}
              aria-label={`Show ${chapter.navLabel}`}
              key={chapter.id}
              onClick={() => setActiveIndex(index)}
              type="button"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductChapter({ chapter }: { chapter: ProductChapterContent }) {
  switch (chapter.componentVariant) {
    case "acquire":
      return <AcquireWorkflowPreview chapter={chapter} />;
    case "onboarding":
      return <OnboardingRail chapter={chapter} />;
    case "training":
      return <TrainingDeliveryPreview chapter={chapter} />;
    case "nutrition_habits":
      return <NutritionHabitsSplit chapter={chapter} />;
    case "messaging":
      return <MessagingContextComparison chapter={chapter} />;
    case "checkins":
      return <CheckinStateRail chapter={chapter} />;
    case "attention":
      return <ClientAttentionChapter chapter={chapter} />;
    case "operations":
      return <OperationsAnalyticsPreview chapter={chapter} />;
    case "client_home":
      return <ClientHomePreview chapter={chapter} />;
    case "team":
      return <TeamAccessPreview chapter={chapter} />;
    case "integrations":
      return <IntegrationAvailabilityLedger chapter={chapter} />;
  }
}

function ChapterCopy({ chapter }: { chapter: ProductChapterContent }) {
  return (
    <div className="rs-product-ref-chapter-copy">
      <p className="rs-product-ref-label">{chapter.eyebrow}</p>
      <h2 id={`${chapter.id}-title`}>{chapter.heading}</h2>
      <p>{chapter.body}</p>
      {chapter.featureList ? <FeatureList items={chapter.featureList} /> : null}
      <p className="rs-product-ref-section-note">{chapter.supportingCopy}</p>
    </div>
  );
}

function ProductSection({
  chapter,
  className = "",
  children,
}: {
  chapter: ProductChapterContent;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${chapter.id}-title`}
      className={`rs-product-ref-section rs-product-ref-chapter ${className}`.trim()}
      data-product-chapter
      id={chapter.id}
    >
      {children}
    </section>
  );
}

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul className="rs-product-ref-checks">
      {items.map((item) => (
        <li key={item}>
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ProductCaptureCanvas({ mediaId }: { mediaId: ProductMediaId }) {
  const models: Partial<
    Record<
      ProductMediaId,
      {
        eyebrow: string;
        title: string;
        metric: string;
        metricLabel: string;
        rows: Array<[string, string]>;
      }
    >
  > = {
    "UI-onboarding": {
      eyebrow: "Client setup",
      title: "Maya Chen",
      metric: "4 / 4",
      metricLabel: "setup steps ready",
      rows: [
        ["Approved lead", "Complete"],
        ["Workspace", "Strength coaching"],
        ["Invitation", "Accepted"],
        ["First check-in", "Friday"],
      ],
    },
    "UI-05-program-assignment": {
      eyebrow: "Assigned program",
      title: "Build phase / Week 3",
      metric: "4",
      metricLabel: "sessions this week",
      rows: [
        ["Monday", "Lower strength"],
        ["Tuesday", "Upper strength"],
        ["Thursday", "Lower volume"],
        ["Saturday", "Upper volume"],
      ],
    },
    "UI-06-nutrition": {
      eyebrow: "Nutrition guidance",
      title: "Current daily targets",
      metric: "2,150",
      metricLabel: "daily calories",
      rows: [
        ["Protein", "165 g"],
        ["Carbohydrate", "225 g"],
        ["Fat", "65 g"],
        ["Active habits", "3 of 4 today"],
      ],
    },
    "UI-01-pt-hub": {
      eyebrow: "PT Hub",
      title: "Tuesday operations",
      metric: "28",
      metricLabel: "active clients",
      rows: [
        ["New applications", "5"],
        ["Check-ins to review", "7"],
        ["Clients needing attention", "3"],
        ["Workspace activity", "Up to date"],
      ],
    },
  };
  const model = models[mediaId] ?? {
    eyebrow: "RepSync workspace",
    title: "Coaching relationship",
    metric: "Live",
    metricLabel: "connected context",
    rows: [
      ["Plan", "Assigned"],
      ["Check-in", "Scheduled"],
      ["Messages", "Up to date"],
      ["Attention", "Reviewed"],
    ],
  };

  return (
    <div
      aria-label={`${model.title} RepSync interface preview`}
      className="rs-product-capture"
      role="img"
    >
      <div className="rs-product-capture__rail" aria-hidden="true">
        <strong>R S</strong>
        <span className="is-active" />
        <span />
        <span />
        <span />
      </div>
      <div className="rs-product-capture__workspace">
        <header>
          <div>
            <span>{model.eyebrow}</span>
            <strong>{model.title}</strong>
          </div>
          <span className="rs-product-capture__status">Active</span>
        </header>
        <div className="rs-product-capture__body">
          <div className="rs-product-capture__rows">
            {model.rows.map(([label, value]) => (
              <p key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </p>
            ))}
          </div>
          <aside>
            <span>Current view</span>
            <strong>{model.metric}</strong>
            <p>{model.metricLabel}</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ProductMediaFallback({
  mediaId,
  title,
  description,
  compact = false,
}: {
  mediaId: ProductMediaId;
  title: string;
  description: string;
  compact?: boolean;
}) {
  const mediaRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const asset = productMediaAssets[mediaId];
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        trackProductMarketingEvent("product_media_viewed", { mediaId });
        observer.disconnect();
      },
      { threshold: 0.45 },
    );
    observer.observe(media);
    return () => observer.disconnect();
  }, [mediaId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || asset?.kind !== "video") return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePlayback = (isVisible: boolean) => {
      if (reducedMotion.matches || !isVisible) {
        video.pause();
        return;
      }
      void video.play().catch(() => undefined);
    };
    const observer = new IntersectionObserver(
      ([entry]) => updatePlayback(Boolean(entry?.isIntersecting)),
      { threshold: 0.35 },
    );
    const onReducedMotionChange = () => updatePlayback(true);

    observer.observe(video);
    reducedMotion.addEventListener("change", onReducedMotionChange);
    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener("change", onReducedMotionChange);
    };
  }, [asset?.kind, asset?.src]);

  return (
    <figure
      className={`rs-product-ref-media ${compact ? "rs-product-ref-media--compact" : ""}`.trim()}
      ref={mediaRef}
    >
      <div className="rs-product-ref-media__bar" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {asset ? (
        <div className="rs-product-ref-media__asset">
          {asset.kind === "video" ? (
            <video
              aria-label={asset.alt}
              height={asset.height}
              loop
              muted
              playsInline
              poster={asset.poster}
              preload="metadata"
              ref={videoRef}
              src={asset.src}
              width={asset.width}
            />
          ) : (
            <img
              alt={asset.alt}
              height={asset.height}
              loading="lazy"
              src={asset.src}
              width={asset.width}
            />
          )}
        </div>
      ) : (
        <ProductCaptureCanvas mediaId={mediaId} />
      )}
      <figcaption>
        <p className="rs-product-ref-label">Inside RepSync</p>
        <h3>{title}</h3>
        <p>{description}</p>
      </figcaption>
    </figure>
  );
}

function AcquireWorkflowPreview({
  chapter,
}: {
  chapter: ProductChapterContent;
}) {
  return (
    <ProductSection chapter={chapter} className="rs-product-ref-section--split">
      <ChapterCopy chapter={chapter} />
      <ProductMediaFallback
        description="Browse a published coach profile, review an option, and begin the application that starts a coaching conversation."
        mediaId={chapter.mediaId}
        title="Public coach profile flow"
      />
    </ProductSection>
  );
}

function OnboardingRail({ chapter }: { chapter: ProductChapterContent }) {
  const stages = [
    ["Approved lead", "Decision recorded with the lead context."],
    ["Workspace", "Place the client in the appropriate coaching workspace."],
    ["Invitation", "Give the client a secure route into RepSync."],
    [
      "Starting setup",
      "Set the program, nutrition guidance, habits, and check-in cadence.",
    ],
  ] as const;
  return (
    <ProductSection
      chapter={chapter}
      className="rs-product-ref-section--center"
    >
      <span className="rs-product-ref-vertical-rail" aria-hidden="true" />
      <ChapterCopy chapter={chapter} />
      <div className="rs-product-ref-stage-row rs-product-ref-stage-row--four">
        {stages.map(([title, body], index) => (
          <article key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{title}</strong>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <ProductMediaFallback
        compact
        description="Invitation, onboarding state, and initial client assignment."
        mediaId={chapter.mediaId}
        title="Approved lead to active coaching"
      />
    </ProductSection>
  );
}

function TrainingDeliveryPreview({
  chapter,
}: {
  chapter: ProductChapterContent;
}) {
  return (
    <ProductSection chapter={chapter} className="rs-product-ref-section--split">
      <ChapterCopy chapter={chapter} />
      <ProductMediaFallback
        description="Reusable program material beside the client-specific assigned version, schedule, and completion state."
        mediaId={chapter.mediaId}
        title="Program template and assigned client program"
      />
    </ProductSection>
  );
}

function NutritionHabitsSplit({ chapter }: { chapter: ProductChapterContent }) {
  return (
    <ProductSection
      chapter={chapter}
      className="rs-product-ref-section--editorial"
    >
      <ChapterCopy chapter={chapter} />
      <div className="rs-product-ref-card-grid rs-product-ref-card-grid--two">
        <article>
          <span aria-hidden="true">
            <Utensils />
          </span>
          <p className="rs-product-ref-label">Nutrition</p>
          <h3>Coach-provided guidance and targets</h3>
          <p>
            Set current nutrition guidance, calories and macronutrient targets
            where assigned, and client-specific notes alongside the plan.
          </p>
        </article>
        <article>
          <span aria-hidden="true">
            <CheckCircle2 />
          </span>
          <p className="rs-product-ref-label">Habits</p>
          <h3>Repeatable actions and completion context</h3>
          <p>
            Track active habits, frequency, completion, and coach-defined
            context such as steps, sleep, energy, hunger, and stress.
          </p>
        </article>
      </div>
      <ProductMediaFallback
        compact
        description="Nutrition assignment and active habits shown as separate, connected coaching surfaces."
        mediaId={chapter.mediaId}
        title="Nutrition and habits"
      />
    </ProductSection>
  );
}

function MessagingContextComparison({
  chapter,
}: {
  chapter: ProductChapterContent;
}) {
  return (
    <ProductSection
      chapter={chapter}
      className="rs-product-ref-section--editorial"
    >
      <ChapterCopy chapter={chapter} />
      <div className="rs-product-ref-message-contexts">
        <article>
          <p className="rs-product-ref-label">Before approval</p>
          <h3>Lead conversation</h3>
          <p>
            Continue the application conversation, clarify fit, and decide
            whether the prospect should move into coaching.
          </p>
          <FeatureList
            items={[
              "Application context",
              "Lead chat and unread state",
              "Approval or decline context",
            ]}
          />
          <div
            className="rs-product-message-preview"
            aria-label="Lead conversation preview"
          >
            <p>
              Thanks for sharing your training history. What would make this
              coaching a good fit?
            </p>
            <p className="is-reply">
              I need a plan that works around three travel days each month.
            </p>
          </div>
        </article>
        <article>
          <p className="rs-product-ref-label">After approval</p>
          <h3>Client messaging</h3>
          <p>
            Keep ongoing coaching questions and feedback connected to the
            client's workspace, assignments, check-ins, and recent activity.
          </p>
          <FeatureList
            items={[
              "Coach-client thread",
              "Client and workspace context",
              "Unread state and recent message",
            ]}
          />
          <div
            className="rs-product-message-preview"
            aria-label="Client conversation preview"
          >
            <p>
              Your lower session is ready. Keep the final two sets at the
              planned effort.
            </p>
            <p className="is-reply">
              Completed. I added a note about the final set.
            </p>
          </div>
        </article>
      </div>
    </ProductSection>
  );
}

function CheckinStateRail({ chapter }: { chapter: ProductChapterContent }) {
  const stages = ["Not open", "Open", "Submitted", "Reviewed", "Follow-up"];
  return (
    <ProductSection chapter={chapter} className="rs-product-ref-checkin">
      <ChapterCopy chapter={chapter} />
      <div className="rs-product-ref-stage-row rs-product-ref-stage-row--five">
        {stages.map((stage, index) => (
          <article key={stage}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{stage}</strong>
          </article>
        ))}
      </div>
      <FeatureList
        items={[
          "Weekly, biweekly, or monthly cadence",
          "Due or open date and client responses",
          "Progress photographs where assigned",
          "Coach notes, review state, and follow-up requirement",
        ]}
      />
    </ProductSection>
  );
}

function LifecycleBadge({ value }: { value: string }) {
  return <span className="rs-product-domain-badge">{value}</span>;
}
function AttentionBadge({ value }: { value: string }) {
  return (
    <span className="rs-product-domain-badge rs-product-domain-badge--risk">
      {value}
    </span>
  );
}
function AttentionReason({ children }: { children: ReactNode }) {
  return <p className="rs-product-attention-reason">{children}</p>;
}

function ClientAttentionChapter({
  chapter,
}: {
  chapter: ProductChapterContent;
}) {
  const signals = [
    "No recent reply",
    "Adherence trending down",
    "Client inactivity",
    "Overdue action",
    "Manual coach flag",
  ];
  return (
    <section
      aria-labelledby={`${chapter.id}-title`}
      className="rs-product-ref-attention rs-product-ref-chapter"
      data-product-chapter
      id={chapter.id}
    >
      <div>
        <p className="rs-product-ref-label">{chapter.eyebrow}</p>
        <h2 id={`${chapter.id}-title`}>{chapter.heading}</h2>
        <p>{chapter.body}</p>
        <div className="rs-product-ref-attention-model">
          <article>
            <h3>Lifecycle</h3>
            <LifecycleBadge value="Active" />
          </article>
          <article>
            <h3>Attention</h3>
            <AttentionBadge value="At risk" />
          </article>
          <article>
            <h3>Reason</h3>
            <AttentionReason>Missed latest check-in</AttentionReason>
          </article>
        </div>
        <p className="rs-product-ref-attention-signals">
          Additional signals: {signals.join(" · ")}
        </p>
        <div
          className="rs-product-ref-lifecycle-list"
          aria-label="Lifecycle values"
        >
          {productLifecycleValues.map((state) => (
            <LifecycleBadge key={state.value} value={state.label} />
          ))}
        </div>
      </div>
      <div className="rs-product-ref-pulse">
        <span>Attention model</span>
        <strong>
          Specific signals.
          <br />
          Human decisions.
        </strong>
        <p>{chapter.supportingCopy}</p>
      </div>
    </section>
  );
}

function OperationsAnalyticsPreview({
  chapter,
}: {
  chapter: ProductChapterContent;
}) {
  return (
    <ProductSection
      chapter={chapter}
      className="rs-product-ref-section--split rs-product-ref-section--reverse"
    >
      <ProductMediaFallback
        description="PT Hub overview with leads, overdue check-ins, lifecycle distribution, attention, and workspace activity."
        mediaId={chapter.mediaId}
        title="PT Hub operations and analytics"
      />
      <ChapterCopy chapter={chapter} />
    </ProductSection>
  );
}

function ClientHomePreview({ chapter }: { chapter: ProductChapterContent }) {
  return (
    <ProductSection chapter={chapter} className="rs-product-ref-experience">
      <ProductMediaFallback
        description="Mobile client home focused on today's workout, nutrition, habits, check-in, messages, and progress."
        mediaId={chapter.mediaId}
        title="Client home"
      />
      <ChapterCopy chapter={chapter} />
    </ProductSection>
  );
}

function TeamAccessPreview({ chapter }: { chapter: ProductChapterContent }) {
  return (
    <ProductSection chapter={chapter} className="rs-product-ref-team">
      <ChapterCopy chapter={chapter} />
      <div className="rs-product-ref-role-row rs-product-ref-role-row--five">
        {productRoleLabels.map((role) => (
          <span key={role}>{role}</span>
        ))}
      </div>
      <FeatureList
        items={[
          "Workspace membership",
          "Assigned-client visibility",
          "Shared coaching communication",
          "Read-only access for viewers",
          "Protected owner actions",
        ]}
      />
    </ProductSection>
  );
}

function IntegrationStatus({
  integration,
}: {
  integration: MarketingIntegration;
}) {
  const labels = {
    available: "Available",
    beta: "Beta",
    coming_soon: "Coming soon",
    hidden: "Hidden",
  } as const;
  return (
    <span className={`rs-product-integration-status is-${integration.status}`}>
      {labels[integration.status]}
    </span>
  );
}

function IntegrationAvailabilityLedger({
  chapter,
}: {
  chapter: ProductChapterContent;
}) {
  const integrations = useMemo(() => getPublicMarketingIntegrations(), []);
  useEffect(() => {
    integrations.forEach((integration) =>
      trackProductMarketingEvent("product_integration_viewed", {
        chapterId: chapter.id,
        integrationId: integration.id,
        integrationPublicStatus: integration.status,
      }),
    );
  }, [chapter.id, integrations]);
  return (
    <ProductSection chapter={chapter} className="rs-product-ref-integrations">
      <ChapterCopy chapter={chapter} />
      <div className="rs-product-integration-ledger">
        {integrations.length ? (
          integrations.map((integration) => (
            <article key={integration.id}>
              <div>
                <p className="rs-product-ref-label">{integration.category}</p>
                <h3>{integration.name}</h3>
                <p>{integration.publicDescription}</p>
              </div>
              <IntegrationStatus integration={integration} />
            </article>
          ))
        ) : (
          <div className="rs-product-integration-ledger__empty" role="status">
            <Link2 aria-hidden="true" />
            <div>
              <h3>No public integrations are listed yet.</h3>
              <p>
                Provider names stay hidden until the connection and its public
                availability status are verified.
              </p>
            </div>
          </div>
        )}
      </div>
    </ProductSection>
  );
}

function ProductReferenceCta() {
  const cta = productPageContent.finalCta;
  return (
    <section className="rs-product-ref-cta" aria-labelledby="product-final-cta">
      <SyncRail />
      <p className="rs-product-ref-label">{cta.eyebrow}</p>
      <h2 id="product-final-cta">{cta.heading}</h2>
      <p>{cta.body}</p>
      <div>
        <Link
          to={cta.primaryDestination}
          onClick={() =>
            trackProductMarketingEvent("product_trial_clicked", {
              ctaLocation: "final",
              ctaDestination: cta.primaryDestination,
            })
          }
        >
          {cta.primaryLabel}
        </Link>
        <Link
          to={cta.secondaryDestination}
          onClick={() =>
            trackProductMarketingEvent("product_for_coaches_clicked", {
              ctaLocation: "final",
              ctaDestination: cta.secondaryDestination,
            })
          }
        >
          {cta.secondaryLabel}
        </Link>
      </div>
    </section>
  );
}

function SyncRail() {
  return (
    <span className="rs-sync-rail" aria-hidden="true">
      <span />
      <span />
    </span>
  );
}
