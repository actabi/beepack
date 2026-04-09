# posthog

> **PostHog** — [PostHog/posthog](https://github.com/PostHog/posthog) | 32,474 stars | Custom license

All-in-one platform for product analytics, session replay, feature flags, experiments, and error tracking. Self-hostable.

This beepack package provides integration helpers and references the official [PostHog/posthog](https://github.com/PostHog/posthog) repository.

## Installation

For production use, install the official package:

```bash
# See https://github.com/PostHog/posthog for the latest install instructions
npm install posthog
```

For beepack usage:

```bash
beepack install posthog
```

## Environment Variables

```bash
POSTHOG_API_KEY=your-value-here
POSTHOG_HOST=your-value-here
```

## Capabilities

- **Event Capture**
- **Feature Flags**
- **Session Recording**
- **Ab Experiments**
- **User Identification**
- **Group Analytics**

## Usage

```js
import { getSetupGuide } from "./index.js";
console.log(getSetupGuide());
```

For full API documentation and examples, visit [PostHog/posthog](https://github.com/PostHog/posthog).

## Links

- **Repository:** [PostHog/posthog](https://github.com/PostHog/posthog)
- **License:** Custom
- **Stars:** 32,474
