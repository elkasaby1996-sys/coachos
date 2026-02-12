import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./components/common/theme-provider";
import { AuthProvider } from "./lib/auth";
import { App } from "./routes/app";
import { initializeThemePreference } from "./lib/theme";
import "./styles/globals.css";

initializeThemePreference("dark");

const isHardFail = (error: any) => {
  const status = error?.status;
  const code = error?.code;
  const message = (error?.message ?? "").toLowerCase();
  if (status === 401 || status === 403) return true;
  if (code === "42703") return true;
  if (message.includes("does not exist")) return true;
  if (message.includes("permission denied")) return true;
  return false;
};

const isRetryable = (error: any) => {
  const status = error?.status;
  if (typeof status === "number" && status >= 500) return true;
  const message = (error?.message ?? "").toLowerCase();
  if (message.includes("failed to fetch")) return true;
  return false;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (isHardFail(error)) return false;
        if (isRetryable(error)) return failureCount < 2;
        return false;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (isHardFail(error)) return false;
        if (isRetryable(error)) return failureCount < 2;
        return false;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
