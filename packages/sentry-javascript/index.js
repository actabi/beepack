// Sentry JavaScript SDK — Integration helper for beepack
// Points to the real package: https://github.com/getsentry/sentry-javascript
// Official Sentry SDKs for JavaScript. Error tracking and performance monitoring for Next.js, React, and Node.js.

/**
 * Error Capture — see https://github.com/getsentry/sentry-javascript for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function error_capture(config) {
  // This is a reference integration pointing to getsentry/sentry-javascript.
  // For production usage, install the real package and follow the official docs.
  throw new Error("error_capture requires the real Sentry JavaScript SDK package. Install from: https://github.com/getsentry/sentry-javascript");
}
/**
 * Performance Tracing — see https://github.com/getsentry/sentry-javascript for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function performance_tracing(config) {
  // This is a reference integration pointing to getsentry/sentry-javascript.
  // For production usage, install the real package and follow the official docs.
  throw new Error("performance_tracing requires the real Sentry JavaScript SDK package. Install from: https://github.com/getsentry/sentry-javascript");
}
/**
 * Breadcrumbs — see https://github.com/getsentry/sentry-javascript for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function breadcrumbs(config) {
  // This is a reference integration pointing to getsentry/sentry-javascript.
  // For production usage, install the real package and follow the official docs.
  throw new Error("breadcrumbs requires the real Sentry JavaScript SDK package. Install from: https://github.com/getsentry/sentry-javascript");
}
/**
 * User Feedback — see https://github.com/getsentry/sentry-javascript for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function user_feedback(config) {
  // This is a reference integration pointing to getsentry/sentry-javascript.
  // For production usage, install the real package and follow the official docs.
  throw new Error("user_feedback requires the real Sentry JavaScript SDK package. Install from: https://github.com/getsentry/sentry-javascript");
}

/**
 * Get setup instructions for Sentry JavaScript SDK.
 * @returns {string} Installation and configuration guide
 */
export function getSetupGuide() {
  return `# Sentry JavaScript SDK Setup

## Installation
See https://github.com/getsentry/sentry-javascript for installation instructions.

## Environment Variables
- SENTRY_DSN

## Quick Start
Visit https://github.com/getsentry/sentry-javascript#readme for the official quick start guide.
`;
}
