# opentelemetry-js

> **OpenTelemetry JavaScript** — [open-telemetry/opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js) | 3,349 stars | Apache-2.0 license

OpenTelemetry JavaScript Client. CNCF standard for traces, metrics, and logs. Vendor-neutral, compatible with Jaeger, Grafana, and Datadog.

This beepack package provides integration helpers and references the official [open-telemetry/opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js) repository.

## Installation

For production use, install the official package:

```bash
# See https://github.com/open-telemetry/opentelemetry-js for the latest install instructions
npm install opentelemetry-js
```

For beepack usage:

```bash
beepack install opentelemetry-js
```

## Environment Variables

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=your-value-here
```

## Capabilities

- **Distributed Tracing**
- **Metrics Collection**
- **Log Export**
- **Span Creation**
- **Context Propagation**
- **Auto Instrumentation**

## Usage

```js
import { getSetupGuide } from "./index.js";
console.log(getSetupGuide());
```

For full API documentation and examples, visit [open-telemetry/opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js).

## Links

- **Repository:** [open-telemetry/opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js)
- **License:** Apache-2.0
- **Stars:** 3,349
