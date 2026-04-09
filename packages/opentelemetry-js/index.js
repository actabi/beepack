// OpenTelemetry JavaScript — Integration helper for beepack
// Points to the real package: https://github.com/open-telemetry/opentelemetry-js
// OpenTelemetry JavaScript Client. CNCF standard for traces, metrics, and logs. Vendor-neutral, compatible with Jaeger, Grafana, and Datadog.

/**
 * Distributed Tracing — see https://github.com/open-telemetry/opentelemetry-js for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function distributed_tracing(config) {
  // This is a reference integration pointing to open-telemetry/opentelemetry-js.
  // For production usage, install the real package and follow the official docs.
  throw new Error("distributed_tracing requires the real OpenTelemetry JavaScript package. Install from: https://github.com/open-telemetry/opentelemetry-js");
}
/**
 * Metrics Collection — see https://github.com/open-telemetry/opentelemetry-js for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function metrics_collection(config) {
  // This is a reference integration pointing to open-telemetry/opentelemetry-js.
  // For production usage, install the real package and follow the official docs.
  throw new Error("metrics_collection requires the real OpenTelemetry JavaScript package. Install from: https://github.com/open-telemetry/opentelemetry-js");
}
/**
 * Log Export — see https://github.com/open-telemetry/opentelemetry-js for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function log_export(config) {
  // This is a reference integration pointing to open-telemetry/opentelemetry-js.
  // For production usage, install the real package and follow the official docs.
  throw new Error("log_export requires the real OpenTelemetry JavaScript package. Install from: https://github.com/open-telemetry/opentelemetry-js");
}
/**
 * Span Creation — see https://github.com/open-telemetry/opentelemetry-js for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function span_creation(config) {
  // This is a reference integration pointing to open-telemetry/opentelemetry-js.
  // For production usage, install the real package and follow the official docs.
  throw new Error("span_creation requires the real OpenTelemetry JavaScript package. Install from: https://github.com/open-telemetry/opentelemetry-js");
}

/**
 * Get setup instructions for OpenTelemetry JavaScript.
 * @returns {string} Installation and configuration guide
 */
export function getSetupGuide() {
  return `# OpenTelemetry JavaScript Setup

## Installation
See https://github.com/open-telemetry/opentelemetry-js for installation instructions.

## Environment Variables
- OTEL_EXPORTER_OTLP_ENDPOINT

## Quick Start
Visit https://github.com/open-telemetry/opentelemetry-js#readme for the official quick start guide.
`;
}
