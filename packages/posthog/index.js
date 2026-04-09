// PostHog — Integration helper for beepack
// Points to the real package: https://github.com/PostHog/posthog
// All-in-one platform for product analytics, session replay, feature flags, experiments, and error tracking. Self-hostable.

/**
 * Event Capture — see https://github.com/PostHog/posthog for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function event_capture(config) {
  // This is a reference integration pointing to PostHog/posthog.
  // For production usage, install the real package and follow the official docs.
  throw new Error("event_capture requires the real PostHog package. Install from: https://github.com/PostHog/posthog");
}
/**
 * Feature Flags — see https://github.com/PostHog/posthog for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function feature_flags(config) {
  // This is a reference integration pointing to PostHog/posthog.
  // For production usage, install the real package and follow the official docs.
  throw new Error("feature_flags requires the real PostHog package. Install from: https://github.com/PostHog/posthog");
}
/**
 * Session Recording — see https://github.com/PostHog/posthog for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function session_recording(config) {
  // This is a reference integration pointing to PostHog/posthog.
  // For production usage, install the real package and follow the official docs.
  throw new Error("session_recording requires the real PostHog package. Install from: https://github.com/PostHog/posthog");
}
/**
 * Ab Experiments — see https://github.com/PostHog/posthog for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function ab_experiments(config) {
  // This is a reference integration pointing to PostHog/posthog.
  // For production usage, install the real package and follow the official docs.
  throw new Error("ab_experiments requires the real PostHog package. Install from: https://github.com/PostHog/posthog");
}

/**
 * Get setup instructions for PostHog.
 * @returns {string} Installation and configuration guide
 */
export function getSetupGuide() {
  return `# PostHog Setup

## Installation
See https://github.com/PostHog/posthog for installation instructions.

## Environment Variables
- POSTHOG_API_KEY
- POSTHOG_HOST

## Quick Start
Visit https://github.com/PostHog/posthog#readme for the official quick start guide.
`;
}
