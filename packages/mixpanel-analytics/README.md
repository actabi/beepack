# mixpanel-analytics

Zero-dependency wrapper for the **Mixpanel** tracking API. Track events, identify users, set profile properties, batch ingest, and create aliases — all with native `fetch`.

## Environment Variables

| Variable | Description |
|---|---|
| `MIXPANEL_TOKEN` | Your Mixpanel project token |

## Installation

```bash
bee add mixpanel-analytics
```

## Usage

```js
import { track, identify, setUserProperties, trackBatch, createAlias } from 'mixpanel-analytics';

// Track a single event
await track('Page Viewed', { page: '/pricing', referrer: 'google' });

// Identify a user and set profile properties
await identify('user-123', { $name: 'Alice', plan: 'pro' });

// Set properties on a user profile
await setUserProperties('user-123', { last_login: new Date().toISOString() });

// Batch-track multiple events
await trackBatch([
  { event: 'Button Clicked', properties: { button: 'signup' } },
  { event: 'Form Submitted', properties: { form: 'onboarding' } },
]);

// Create an alias (merge anonymous and authenticated IDs)
await createAlias('user-123', 'anon-456');
```

## API

### `track(event, properties?, opts?)` — Track a single event.
### `identify(distinctId, properties?, opts?)` — Identify a user and set profile properties.
### `setUserProperties(distinctId, properties, opts?)` — Set user profile properties.
### `trackBatch(events, opts?)` — Track multiple events in one request.
### `createAlias(distinctId, alias, opts?)` — Merge two distinct IDs with an alias.

All functions return `{ success: true }` on success or `null` on failure.

## License

MIT
