// Inngest — Integration helper for beepack
// Points to the real package: https://github.com/inngest/inngest-js
// Developer platform for building reliable workflows with zero infrastructure. Serverless alternative to BullMQ, no Redis needed.

/**
 * Event Driven Functions — see https://github.com/inngest/inngest-js for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function event_driven_functions(config) {
  // This is a reference integration pointing to inngest/inngest-js.
  // For production usage, install the real package and follow the official docs.
  throw new Error("event_driven_functions requires the real Inngest package. Install from: https://github.com/inngest/inngest-js");
}
/**
 * Scheduled Tasks — see https://github.com/inngest/inngest-js for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function scheduled_tasks(config) {
  // This is a reference integration pointing to inngest/inngest-js.
  // For production usage, install the real package and follow the official docs.
  throw new Error("scheduled_tasks requires the real Inngest package. Install from: https://github.com/inngest/inngest-js");
}
/**
 * Step Functions — see https://github.com/inngest/inngest-js for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function step_functions(config) {
  // This is a reference integration pointing to inngest/inngest-js.
  // For production usage, install the real package and follow the official docs.
  throw new Error("step_functions requires the real Inngest package. Install from: https://github.com/inngest/inngest-js");
}
/**
 * Retry Logic — see https://github.com/inngest/inngest-js for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function retry_logic(config) {
  // This is a reference integration pointing to inngest/inngest-js.
  // For production usage, install the real package and follow the official docs.
  throw new Error("retry_logic requires the real Inngest package. Install from: https://github.com/inngest/inngest-js");
}

/**
 * Get setup instructions for Inngest.
 * @returns {string} Installation and configuration guide
 */
export function getSetupGuide() {
  return `# Inngest Setup

## Installation
See https://github.com/inngest/inngest-js for installation instructions.

## Environment Variables
- INNGEST_EVENT_KEY
- INNGEST_SIGNING_KEY

## Quick Start
Visit https://github.com/inngest/inngest-js#readme for the official quick start guide.
`;
}
