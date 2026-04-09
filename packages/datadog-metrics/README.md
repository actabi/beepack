# Datadog Metrics

Zero-dependency Datadog API client. Submit custom metrics, create monitors, query time series, and send events.

## Prerequisites

- Node.js >= 18
- Datadog account with API and Application keys

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`DD_API_KEY\` | Datadog API key |
| \`DD_APP_KEY\` | Datadog Application key |

## Usage

### Submit a Gauge Metric

\`\`\`js
import { gauge } from './index.js';
await gauge(process.env.DD_API_KEY, process.env.DD_APP_KEY, "app.requests.count", 42, ["env:prod"]);
\`\`\`

### Query Time Series

\`\`\`js
import { queryMetrics } from './index.js';
const now = Math.floor(Date.now() / 1000);
const data = await queryMetrics(apiKey, appKey, "avg:system.cpu.user{*}", now - 3600, now);
\`\`\`

### Create a Monitor

\`\`\`js
import { createMonitor } from './index.js';
await createMonitor(apiKey, appKey, {
  name: "High CPU Alert",
  type: "metric alert",
  query: "avg(last_5m):avg:system.cpu.user{*} > 90",
  message: "CPU usage is above 90%! @slack-ops"
});
\`\`\`

## Source

Based on [dd-trace-js](https://github.com/DataDog/dd-trace-js) (790+ stars).