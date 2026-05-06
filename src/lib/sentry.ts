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

function readNumberEnv(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) return;

  const isProduction = import.meta.env.PROD;
  const environment =
    import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE;
  const release = import.meta.env.VITE_SENTRY_RELEASE;

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
    ],
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

