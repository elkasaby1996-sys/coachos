import * as Sentry from "@sentry/react";

type MetricAttributes = Record<string, string | number | boolean>;

declare global {
  interface Window {
    repsyncSentryMetricSmokeTest?: () => Promise<boolean>;
  }
}

function routeAttributes(extra?: MetricAttributes) {
  return {
    route: window.location.pathname,
    ...extra,
  };
}

export function countMetric(
  name: string,
  value = 1,
  attributes?: MetricAttributes,
) {
  Sentry.metrics.count(name, value, {
    attributes: routeAttributes(attributes),
  });
}

export function gaugeMetric(
  name: string,
  value: number,
  attributes?: MetricAttributes,
) {
  Sentry.metrics.gauge(name, value, {
    attributes: routeAttributes(attributes),
  });
}

export function distributionMetric(
  name: string,
  value: number,
  unit?: string,
  attributes?: MetricAttributes,
) {
  Sentry.metrics.distribution(name, value, {
    unit,
    attributes: routeAttributes(attributes),
  });
}

export function reportInitialPageLoadMetric() {
  const report = () => {
    const pageLoadTime = Math.round(performance.now());

    gaugeMetric("app.page_load_time", pageLoadTime, {
      source: "navigation",
    });
    distributionMetric(
      "app.page_load_time.distribution",
      pageLoadTime,
      "millisecond",
      {
        source: "navigation",
      },
    );
  };

  if (document.readyState === "complete") {
    window.setTimeout(report, 0);
    return;
  }

  window.addEventListener("load", report, { once: true });
}

export function installSentryMetricSmokeTest() {
  if (!import.meta.env.DEV) return;

  window.repsyncSentryMetricSmokeTest = async () => {
    countMetric("button_click", 1, { source: "manual_smoke_test" });
    gaugeMetric("page_load_time", Math.round(performance.now()), {
      source: "manual_smoke_test",
    });
    distributionMetric("response_time", 200, "millisecond", {
      source: "manual_smoke_test",
    });

    return Sentry.flush(2000);
  };
}
