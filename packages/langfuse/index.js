// Langfuse — Integration helper for beepack
// Points to the real package: https://github.com/langfuse/langfuse
// Open source LLM engineering platform. Observability, metrics, evals, and prompt management for AI applications.

/**
 * Trace Llm Calls — see https://github.com/langfuse/langfuse for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function trace_llm_calls(config) {
  // This is a reference integration pointing to langfuse/langfuse.
  // For production usage, install the real package and follow the official docs.
  throw new Error("trace_llm_calls requires the real Langfuse package. Install from: https://github.com/langfuse/langfuse");
}
/**
 * Track Costs — see https://github.com/langfuse/langfuse for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function track_costs(config) {
  // This is a reference integration pointing to langfuse/langfuse.
  // For production usage, install the real package and follow the official docs.
  throw new Error("track_costs requires the real Langfuse package. Install from: https://github.com/langfuse/langfuse");
}
/**
 * Evaluate Outputs — see https://github.com/langfuse/langfuse for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function evaluate_outputs(config) {
  // This is a reference integration pointing to langfuse/langfuse.
  // For production usage, install the real package and follow the official docs.
  throw new Error("evaluate_outputs requires the real Langfuse package. Install from: https://github.com/langfuse/langfuse");
}
/**
 * Manage Prompts — see https://github.com/langfuse/langfuse for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function manage_prompts(config) {
  // This is a reference integration pointing to langfuse/langfuse.
  // For production usage, install the real package and follow the official docs.
  throw new Error("manage_prompts requires the real Langfuse package. Install from: https://github.com/langfuse/langfuse");
}

/**
 * Get setup instructions for Langfuse.
 * @returns {string} Installation and configuration guide
 */
export function getSetupGuide() {
  return `# Langfuse Setup

## Installation
See https://github.com/langfuse/langfuse for installation instructions.

## Environment Variables
- LANGFUSE_SECRET_KEY
- LANGFUSE_PUBLIC_KEY
- LANGFUSE_HOST

## Quick Start
Visit https://github.com/langfuse/langfuse#readme for the official quick start guide.
`;
}
