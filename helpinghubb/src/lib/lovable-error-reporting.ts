type PlatformErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type PlatformEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: PlatformErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __platformEvents?: PlatformEvents;
  }
}

export function reportPlatformError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.__platformEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
}
