// Sentry Setup Helpers for Next.js App Router
// Zero dependencies — generates config objects and source code strings.
// Supports client, server, and edge runtimes; source map upload via
// withSentryConfig; user context enrichment; custom event capture;
// performance tracing; and React error boundary source generation.

// ─── Constants ────────────────────────────────────────────────────────────────

const PKG = "[sentry-setup]";

// ─── Shared Config Builder ────────────────────────────────────────────────────

/**
 * Build the shared Sentry init options used across all three runtime configs.
 * Client, server, and edge configs each call this and layer their own overrides.
 *
 * @param {object} options
 * @param {string} [options.dsn]                          - Sentry DSN (defaults to SENTRY_DSN env var)
 * @param {string} [options.environment]                  - Deployment environment (defaults to NODE_ENV)
 * @param {string} [options.release]                      - Release identifier (e.g. git SHA)
 * @param {number} [options.tracesSampleRate=0.1]         - Fraction of transactions to trace (0–1)
 * @param {number} [options.replaysSessionSampleRate=0.1] - Session replay sample rate (client only)
 * @param {number} [options.replaysOnErrorSampleRate=1.0] - Replay sample rate when an error occurs (client only)
 * @param {boolean} [options.debug=false]                 - Enable Sentry SDK debug logging
 * @param {string[]} [options.ignoreErrors=[]]            - Regex strings / literals to suppress
 * @param {boolean} [options.scrubBreadcrumbs=true]       - Strip PII from breadcrumbs automatically
 * @returns {object|null} Shared Sentry init config, or null on validation failure
 */
export function buildSharedSentryConfig(options = {}) {
  const {
    dsn = process.env.SENTRY_DSN,
    environment = process.env.NODE_ENV ?? "production",
    release,
    tracesSampleRate = 0.1,
    replaysSessionSampleRate = 0.1,
    replaysOnErrorSampleRate = 1.0,
    debug = false,
    ignoreErrors = [],
    scrubBreadcrumbs = true,
  } = options;

  if (!dsn) {
    console.error(`${PKG} buildSharedSentryConfig: SENTRY_DSN is not set. Sentry will not initialise.`);
    return null;
  }

  if (!environment) {
    console.error(`${PKG} buildSharedSentryConfig: environment is empty. Set NODE_ENV or pass environment explicitly to avoid un-tagged events.`);
    return null;
  }

  const config = {
    dsn,
    environment,
    tracesSampleRate,
    replaysSessionSampleRate,
    replaysOnErrorSampleRate,
    debug,
    ignoreErrors,
  };

  if (release) {
    config.release = release;
  }

  // PII guard: strip sensitive keys from breadcrumb data before they reach Sentry.
  // Common culprits are Authorization headers, password fields, and cookie values.
  if (scrubBreadcrumbs) {
    const PII_KEYS = /password|token|secret|authorization|cookie|ssn|credit.?card/i;

    config.beforeBreadcrumb = (breadcrumb) => {
      if (breadcrumb.data && typeof breadcrumb.data === "object") {
        const cleaned = {};
        for (const [key, value] of Object.entries(breadcrumb.data)) {
          cleaned[key] = PII_KEYS.test(key) ? "[Filtered]" : value;
        }
        breadcrumb.data = cleaned;
      }
      return breadcrumb;
    };
  }

  return config;
}

// ─── Runtime-specific Config Generators ──────────────────────────────────────

/**
 * Generate source code for `sentry.client.config.js` (browser runtime).
 *
 * Write this file to the project root. Next.js picks it up automatically.
 * It enables Session Replay and Browser Tracing integrations.
 *
 * @param {object} [options]                              - Forwarded to buildSharedSentryConfig
 * @param {boolean} [options.enableReplay=true]           - Include the Replay integration
 * @param {string}  [options.sdkImport="@sentry/nextjs"] - SDK package to import from
 * @returns {string|null} Source code string, or null on validation failure
 */
export function generateClientConfig(options = {}) {
  const {
    enableReplay = true,
    sdkImport = "@sentry/nextjs",
    ...sharedOptions
  } = options;

  const shared = buildSharedSentryConfig(sharedOptions);
  if (!shared) return null;

  const replayIntegration = enableReplay
    ? `\n  Sentry.replayIntegration({
    // Mask all text and block all media by default to avoid PII leaks.
    maskAllText: true,
    blockAllMedia: true,
  }),`
    : "";

  return `// sentry.client.config.js
// Initialises Sentry in the browser (client runtime).
// Next.js loads this file automatically — do NOT import it manually.
// See: https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "${sdkImport}";

Sentry.init({
  dsn: ${JSON.stringify(shared.dsn)},
  environment: ${JSON.stringify(shared.environment)},${shared.release ? `\n  release: ${JSON.stringify(shared.release)},` : ""}
  tracesSampleRate: ${shared.tracesSampleRate},
  replaysSessionSampleRate: ${shared.replaysSessionSampleRate},
  replaysOnErrorSampleRate: ${shared.replaysOnErrorSampleRate},
  debug: ${shared.debug},
  ${ignoreErrorsClause(shared.ignoreErrors)}
  integrations: [
    Sentry.browserTracingIntegration(),${replayIntegration}
  ],

  // Strip PII from breadcrumbs before upload.
  beforeBreadcrumb(breadcrumb) {
    const PII = /password|token|secret|authorization|cookie|ssn|credit.?card/i;
    if (breadcrumb.data && typeof breadcrumb.data === "object") {
      for (const key of Object.keys(breadcrumb.data)) {
        if (PII.test(key)) breadcrumb.data[key] = "[Filtered]";
      }
    }
    return breadcrumb;
  },
});
`;
}

/**
 * Generate source code for `sentry.server.config.js` (Node.js runtime).
 *
 * Enables OpenTelemetry-based server tracing, including DB query spans when
 * the appropriate OTel instrumentation is active.
 *
 * @param {object} [options]                              - Forwarded to buildSharedSentryConfig
 * @param {string}  [options.sdkImport="@sentry/nextjs"] - SDK package to import from
 * @returns {string|null} Source code string, or null on validation failure
 */
export function generateServerConfig(options = {}) {
  const { sdkImport = "@sentry/nextjs", ...sharedOptions } = options;

  const shared = buildSharedSentryConfig(sharedOptions);
  if (!shared) return null;

  return `// sentry.server.config.js
// Initialises Sentry in the Node.js server runtime.
// Next.js loads this file automatically — do NOT import it manually.

import * as Sentry from "${sdkImport}";

Sentry.init({
  dsn: ${JSON.stringify(shared.dsn)},
  environment: ${JSON.stringify(shared.environment)},${shared.release ? `\n  release: ${JSON.stringify(shared.release)},` : ""}
  tracesSampleRate: ${shared.tracesSampleRate},
  debug: ${shared.debug},
  ${ignoreErrorsClause(shared.ignoreErrors)}
  // Automatically instruments Node.js http, fetch, and DB adapters
  // when OTel-compatible libraries are present.
  integrations: [
    Sentry.httpIntegration({ tracing: true }),
  ],

  // Strip PII from breadcrumbs before upload.
  beforeBreadcrumb(breadcrumb) {
    const PII = /password|token|secret|authorization|cookie|ssn|credit.?card/i;
    if (breadcrumb.data && typeof breadcrumb.data === "object") {
      for (const key of Object.keys(breadcrumb.data)) {
        if (PII.test(key)) breadcrumb.data[key] = "[Filtered]";
      }
    }
    return breadcrumb;
  },
});
`;
}

/**
 * Generate source code for `sentry.edge.config.js` (Edge runtime).
 *
 * The Edge runtime has a restricted API — no Node.js built-ins. Only a subset
 * of Sentry SDK features are available here.
 *
 * @param {object} [options]                              - Forwarded to buildSharedSentryConfig
 * @param {string}  [options.sdkImport="@sentry/nextjs"] - SDK package to import from
 * @returns {string|null} Source code string, or null on validation failure
 */
export function generateEdgeConfig(options = {}) {
  const { sdkImport = "@sentry/nextjs", ...sharedOptions } = options;

  const shared = buildSharedSentryConfig(sharedOptions);
  if (!shared) return null;

  return `// sentry.edge.config.js
// Initialises Sentry in the Edge runtime (middleware, edge API routes).
// Next.js loads this file automatically — do NOT import it manually.
// IMPORTANT: Edge runtime has no Node.js APIs. Keep this config minimal.

import * as Sentry from "${sdkImport}";

Sentry.init({
  dsn: ${JSON.stringify(shared.dsn)},
  environment: ${JSON.stringify(shared.environment)},${shared.release ? `\n  release: ${JSON.stringify(shared.release)},` : ""}
  // Keep sample rate low on edge — these run for every request.
  tracesSampleRate: ${Math.min(shared.tracesSampleRate, 0.05)},
  debug: ${shared.debug},
  ${ignoreErrorsClause(shared.ignoreErrors)}
});
`;
}

// ─── next.config.js Integration ──────────────────────────────────────────────

/**
 * Generate the `withSentryConfig` wrapper snippet to paste into `next.config.js`.
 *
 * Handles source map upload, hides source maps from the browser bundle, and
 * guards against the most common asset-prefix misconfiguration.
 *
 * @param {object} [options]
 * @param {string}  [options.org]                        - Sentry organisation slug
 * @param {string}  [options.project]                    - Sentry project slug
 * @param {string}  [options.authToken]                  - Sentry auth token (defaults to SENTRY_AUTH_TOKEN)
 * @param {boolean} [options.hideSourceMaps=true]        - Prevent source maps from being served to browsers
 * @param {boolean} [options.widenClientFileUpload=false] - Upload a larger set of source files for better coverage
 * @param {string}  [options.assetPrefix]                - CDN prefix (e.g. "https://cdn.example.com"). If set, Sentry's
 *                                                         urlPrefix is updated to match. Omitting this when using a CDN
 *                                                         is the #1 cause of "source maps not found" errors.
 * @returns {string|null} Source code snippet, or null on validation failure
 */
export function generateNextConfigWrapper(options = {}) {
  const {
    org,
    project,
    authToken = process.env.SENTRY_AUTH_TOKEN,
    hideSourceMaps = true,
    widenClientFileUpload = false,
    assetPrefix,
  } = options;

  if (!authToken) {
    console.error(`${PKG} generateNextConfigWrapper: SENTRY_AUTH_TOKEN is not set. Source maps will not be uploaded.`);
    return null;
  }

  if (!org || !project) {
    console.error(`${PKG} generateNextConfigWrapper: org and project are required for source map upload.`);
    return null;
  }

  const urlPrefixLine = assetPrefix
    ? `\n    // CDN prefix detected — Sentry must match it or source maps won't resolve.\n    urlPrefix: \`~/_next/static/\`,`
    : "";

  const assetPrefixWarning = assetPrefix
    ? `\n// NOTE: assetPrefix is "${assetPrefix}". Sentry's urlPrefix has been set to match.\n// If your CDN path differs from /_next/static, adjust urlPrefix accordingly.`
    : "";

  return `// next.config.js — withSentryConfig wrapper
// Wrap your existing Next.js config object with withSentryConfig.
// This handles source map generation and upload to Sentry on each build.
${assetPrefixWarning}
import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ...your existing Next.js config...
};

export default withSentryConfig(nextConfig, {
  org: ${JSON.stringify(org)},
  project: ${JSON.stringify(project)},
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a larger set of source files for more complete stack traces.
  widenClientFileUpload: ${widenClientFileUpload},

  // Prevent source maps from being served to end-users.
  // They are uploaded to Sentry and then deleted from the build output.
  hideSourceMaps: ${hideSourceMaps},

  // Suppress noisy Sentry CLI output during builds.
  silent: process.env.CI !== "true",
  ${urlPrefixLine}
});
`;
}

// ─── User Context Enrichment ──────────────────────────────────────────────────

/**
 * Build a Sentry scope update that attaches user identity to all subsequent events.
 *
 * Call this after a user signs in. Returns a plain config object — pass it to
 * `Sentry.setUser(enrichUserContext(...))` in your application code.
 *
 * Only non-PII fields are included by default. Email is opt-in because GDPR
 * and similar laws may restrict storing it in a third-party error tracker.
 *
 * @param {object} user
 * @param {string} user.id                        - Required. Internal user identifier.
 * @param {string} [user.email]                   - Optional. Include only if your DPA permits it.
 * @param {string} [user.username]                - Optional. Display name or handle.
 * @param {string} [user.role]                    - Optional. e.g. "admin", "member"
 * @param {object} [options]
 * @param {boolean} [options.includeEmail=false]  - Explicitly opt in to sending email to Sentry
 * @returns {object|null} Sentry user object for Sentry.setUser(), or null on validation failure
 */
export function enrichUserContext(user = {}, options = {}) {
  const { id, email, username, role } = user;
  const { includeEmail = false } = options;

  if (!id) {
    console.error(`${PKG} enrichUserContext: user.id is required. Skipping user context.`);
    return null;
  }

  const sentryUser = { id: String(id) };

  if (username) sentryUser.username = username;
  if (role) sentryUser.role = role;

  if (email) {
    if (includeEmail) {
      sentryUser.email = email;
    } else {
      // Log a reminder so developers can make an explicit choice
      console.error(
        `${PKG} enrichUserContext: user.email was provided but includeEmail is false. ` +
        `Pass options.includeEmail=true to attach it (ensure your privacy policy/DPA permits this).`
      );
    }
  }

  return sentryUser;
}

// ─── Custom Event Capture ─────────────────────────────────────────────────────

/**
 * Build a structured Sentry event payload for custom event capture.
 *
 * Returns a config object for use with `Sentry.captureEvent()` or
 * `Sentry.captureException()`. Attaches structured metadata as tags and
 * extra data so events are filterable in the Sentry UI.
 *
 * @param {object} options
 * @param {string}  options.message                      - Human-readable event description
 * @param {Error}   [options.error]                      - Original Error object (use captureException path)
 * @param {string}  [options.category="app"]             - Logical category (e.g. "payment", "auth", "db")
 * @param {"fatal"|"error"|"warning"|"info"|"debug"} [options.level="error"] - Sentry severity level
 * @param {object}  [options.tags={}]                    - Key/value string tags (searchable in Sentry)
 * @param {object}  [options.metadata={}]                - Arbitrary structured data attached as extra
 * @param {string}  [options.fingerprint]                - Custom fingerprint to group related events
 * @returns {object|null} Sentry event object, or null on validation failure
 */
export function buildCustomEvent(options = {}) {
  const {
    message,
    error,
    category = "app",
    level = "error",
    tags = {},
    metadata = {},
    fingerprint,
  } = options;

  if (!message) {
    console.error(`${PKG} buildCustomEvent: message is required.`);
    return null;
  }

  const VALID_LEVELS = ["fatal", "error", "warning", "info", "debug"];
  if (!VALID_LEVELS.includes(level)) {
    console.error(`${PKG} buildCustomEvent: invalid level "${level}". Must be one of: ${VALID_LEVELS.join(", ")}.`);
    return null;
  }

  const event = {
    message,
    level,
    tags: { category, ...tags },
    extra: metadata,
  };

  if (error instanceof Error) {
    event.extra.errorMessage = error.message;
    event.extra.errorStack = error.stack;
  }

  if (fingerprint) {
    event.fingerprint = [fingerprint];
  }

  return event;
}

// ─── Performance Tracing Helpers ──────────────────────────────────────────────

/**
 * Generate a source code string for a Next.js App Router API route instrumented
 * with Sentry performance tracing.
 *
 * The generated route wraps the handler in a Sentry span so API latency appears
 * in the Sentry Performance dashboard, tagged by route and HTTP method.
 *
 * @param {object} options
 * @param {string} options.routeName                     - Human-readable route name (e.g. "api/orders")
 * @param {string} [options.sdkImport="@sentry/nextjs"] - SDK package to import from
 * @param {boolean} [options.traceDbQueries=false]       - Include a stub DB query span example
 * @returns {string|null} Source code string for the route file, or null on validation failure
 */
export function generateTracedApiRouteSource(options = {}) {
  const {
    routeName,
    sdkImport = "@sentry/nextjs",
    traceDbQueries = false,
  } = options;

  if (!routeName) {
    console.error(`${PKG} generateTracedApiRouteSource: routeName is required.`);
    return null;
  }

  const dbSpanExample = traceDbQueries
    ? `
    // Trace a DB query as a child span.
    // Replace with your actual ORM/query call.
    const rows = await Sentry.startSpan(
      { name: "db.query", op: "db", attributes: { "db.statement": "SELECT ..." } },
      async () => {
        // const rows = await db.query("SELECT ...");
        return [];
      }
    );`
    : "";

  return `// app/api/${routeName}/route.js
// Instrumented with Sentry performance tracing.
// Each request is wrapped in a Sentry span visible in the Performance dashboard.

import * as Sentry from "${sdkImport}";
import { NextResponse } from "next/server";

export async function GET(request) {
  return await Sentry.startSpan(
    {
      name: "GET /api/${routeName}",
      op: "http.server",
      attributes: {
        "http.method": "GET",
        "http.route": "/api/${routeName}",
      },
    },
    async (span) => {
      try {${dbSpanExample}
        // Your handler logic here.
        return NextResponse.json({ ok: true });
      } catch (err) {
        Sentry.captureException(err);
        span.setStatus({ code: 2, message: err.message }); // 2 = ERROR
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
      }
    }
  );
}
`;
}

// ─── Error Boundary Generator ─────────────────────────────────────────────────

/**
 * Generate source code for a React Error Boundary component wired to Sentry.
 *
 * The component catches render-phase errors, reports them via
 * `Sentry.captureException`, and renders a configurable fallback UI.
 * Use this as a drop-in replacement for Sentry's own ErrorBoundary when you
 * need full control over the fallback or additional structured metadata.
 *
 * @param {object} [options]
 * @param {string} [options.componentName="SentryErrorBoundary"] - Class name for the generated component
 * @param {string} [options.sdkImport="@sentry/nextjs"]          - SDK package to import from
 * @param {string} [options.fallbackMessage="Something went wrong."] - User-visible error message
 * @returns {string} Source code string for the error boundary component
 */
export function generateErrorBoundarySource(options = {}) {
  const {
    componentName = "SentryErrorBoundary",
    sdkImport = "@sentry/nextjs",
    fallbackMessage = "Something went wrong.",
  } = options;

  return `// components/${componentName}.jsx
// React Error Boundary that reports caught render errors to Sentry.
// Wrap any subtree you want to isolate:
//   <${componentName} metadata={{ page: "dashboard" }}>
//     <YourComponent />
//   </${componentName}>

"use client";

import { Component } from "react";
import * as Sentry from "${sdkImport}";

export default class ${componentName} extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, eventId: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    const eventId = Sentry.captureException(error, {
      extra: {
        componentStack: info.componentStack,
        // Merge any caller-supplied metadata for richer context in Sentry.
        ...(this.props.metadata ?? {}),
      },
    });
    this.setState({ eventId });
  }

  handleReset = () => {
    this.setState({ hasError: false, eventId: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{ padding: "1rem", border: "1px solid #f5c6cb" }}>
          <p>${fallbackMessage}</p>
          {this.state.eventId && (
            <p style={{ fontSize: "0.75rem", color: "#6c757d" }}>
              Reference: {this.state.eventId}
            </p>
          )}
          <button onClick={this.handleReset}>Try again</button>
        </div>
      );
    }

    return this.props.children;
  }
}
`;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Format the ignoreErrors clause for generated config files.
 * Returns an empty string when the array is empty.
 *
 * @param {string[]} ignoreErrors
 * @returns {string}
 */
function ignoreErrorsClause(ignoreErrors) {
  if (!ignoreErrors || ignoreErrors.length === 0) return "";
  return `ignoreErrors: ${JSON.stringify(ignoreErrors)},`;
}
