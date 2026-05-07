import React from "react";
import * as Sentry from "@sentry/react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";

const DEFAULT_PRODUCTION_TRACE_SAMPLE_RATE = 0.1;
const DEFAULT_DEVELOPMENT_TRACE_SAMPLE_RATE = 1.0;
const DEFAULT_PRODUCTION_ERROR_REPLAY_SAMPLE_RATE = 0.25;
const DEFAULT_DEVELOPMENT_ERROR_REPLAY_SAMPLE_RATE = 1.0;
const DEFAULT_LOG_LEVELS = ["warn", "error"] as const;
const DEFAULT_TRACE_PROPAGATION_TARGETS = ["localhost", /^\/api/] as const;

function readNumberEnv(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanEnv(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readConsoleLogLevelsEnv(value: string | undefined) {
  if (!value) return [...DEFAULT_LOG_LEVELS];

  const levels = value
    .split(",")
    .map((level) => level.trim())
    .filter((level): level is "log" | "warn" | "error" =>
      ["log", "warn", "error"].includes(level),
    );

  return levels.length > 0 ? levels : [...DEFAULT_LOG_LEVELS];
}

function readTracePropagationTargetsEnv(value: string | undefined) {
  if (!value) return [...DEFAULT_TRACE_PROPAGATION_TARGETS];

  const targets = value
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean);

  return targets.length > 0
    ? [...DEFAULT_TRACE_PROPAGATION_TARGETS, ...targets]
    : [...DEFAULT_TRACE_PROPAGATION_TARGETS];
}

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) return;

  const isProduction = import.meta.env.PROD;
  const environment =
    import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE;
  const release = import.meta.env.VITE_SENTRY_RELEASE;
  const enableLogs = readBooleanEnv(
    import.meta.env.VITE_SENTRY_ENABLE_LOGS,
    true,
  );
  const enableMetrics = readBooleanEnv(
    import.meta.env.VITE_SENTRY_ENABLE_METRICS,
    true,
  );

  Sentry.init({
    dsn,
    environment,
    release,
    integrations: [
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect: React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
      ...(enableLogs
        ? [
            Sentry.consoleLoggingIntegration({
              levels: readConsoleLogLevelsEnv(
                import.meta.env.VITE_SENTRY_CONSOLE_LOG_LEVELS,
              ),
            }),
          ]
        : []),
    ],
    enableLogs,
    enableMetrics,
    tracePropagationTargets: readTracePropagationTargetsEnv(
      import.meta.env.VITE_SENTRY_TRACE_PROPAGATION_TARGETS,
    ),
    tracesSampleRate: readNumberEnv(
      import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
      isProduction
        ? DEFAULT_PRODUCTION_TRACE_SAMPLE_RATE
        : DEFAULT_DEVELOPMENT_TRACE_SAMPLE_RATE,
    ),
    replaysSessionSampleRate: readNumberEnv(
      import.meta.env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
      0,
    ),
    replaysOnErrorSampleRate: readNumberEnv(
      import.meta.env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE,
      isProduction
        ? DEFAULT_PRODUCTION_ERROR_REPLAY_SAMPLE_RATE
        : DEFAULT_DEVELOPMENT_ERROR_REPLAY_SAMPLE_RATE,
    ),
    beforeSend(event) {
      return event;
    },
  });
}
