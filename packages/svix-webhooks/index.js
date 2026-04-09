// Svix Webhooks — Integration helper for beepack
// Points to the real package: https://github.com/svix/svix-webhooks
// Enterprise-ready webhooks service. Send, receive, and verify webhooks with automatic retries and signature verification.

/**
 * Send Webhooks — see https://github.com/svix/svix-webhooks for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function send_webhooks(config) {
  // This is a reference integration pointing to svix/svix-webhooks.
  // For production usage, install the real package and follow the official docs.
  throw new Error("send_webhooks requires the real Svix Webhooks package. Install from: https://github.com/svix/svix-webhooks");
}
/**
 * Receive Webhooks — see https://github.com/svix/svix-webhooks for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function receive_webhooks(config) {
  // This is a reference integration pointing to svix/svix-webhooks.
  // For production usage, install the real package and follow the official docs.
  throw new Error("receive_webhooks requires the real Svix Webhooks package. Install from: https://github.com/svix/svix-webhooks");
}
/**
 * Verify Signatures — see https://github.com/svix/svix-webhooks for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function verify_signatures(config) {
  // This is a reference integration pointing to svix/svix-webhooks.
  // For production usage, install the real package and follow the official docs.
  throw new Error("verify_signatures requires the real Svix Webhooks package. Install from: https://github.com/svix/svix-webhooks");
}
/**
 * Automatic Retries — see https://github.com/svix/svix-webhooks for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function automatic_retries(config) {
  // This is a reference integration pointing to svix/svix-webhooks.
  // For production usage, install the real package and follow the official docs.
  throw new Error("automatic_retries requires the real Svix Webhooks package. Install from: https://github.com/svix/svix-webhooks");
}

/**
 * Get setup instructions for Svix Webhooks.
 * @returns {string} Installation and configuration guide
 */
export function getSetupGuide() {
  return `# Svix Webhooks Setup

## Installation
See https://github.com/svix/svix-webhooks for installation instructions.

## Environment Variables
- SVIX_API_KEY

## Quick Start
Visit https://github.com/svix/svix-webhooks#readme for the official quick start guide.
`;
}
