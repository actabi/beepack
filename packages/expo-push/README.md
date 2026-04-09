# expo-push

Send push notifications via Expo's push service. Covers push token registration and storage, single and batch sends, delivery receipt polling, iOS/Android payload tuning, and deep link handling. Zero dependencies — uses native fetch.

## Setup

No environment variables are required. The Expo push endpoint is a public API.

```bash
# Optional: set to raise Expo's per-project rate limits
EXPO_ACCESS_TOKEN=your_expo_access_token_here
```

Get an access token from [expo.dev/accounts/[account]/settings/access-tokens](https://expo.dev/accounts/[account]/settings/access-tokens).

In your Expo app, obtain a push token at startup:

```js
import * as Notifications from 'expo-notifications';

async function registerForPushNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: 'your-expo-project-id', // from app.json / app.config.js
  });
  return tokenData.data; // "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

Send that token to your backend and register it with `createTokenRegistry`.

## Usage

### Register and store push tokens

```js
import { createTokenRegistry } from './index.js';

const registry = createTokenRegistry();

// On user login / device registration:
registry.register('user-123', 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]');

// On logout or after a DeviceNotRegistered receipt error:
registry.unregister('user-123', 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]');

// Fan-out: get all tokens for a specific user
const tokens = registry.getTokens('user-123');

// Broadcast: iterate every registered device
const allDevices = registry.getAllEntries();
// [{ userId: 'user-123', token: 'ExponentPushToken[...]' }, ...]
```

Swap the internal Map with DB calls (e.g. Postgres, Redis) in production — the registry API is designed to make that replacement straightforward.

### Send a single notification

```js
import { sendNotification } from './index.js';

const result = await sendNotification(
  'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  'Your order has shipped!',
  {
    title: 'Order Update',
    sound: 'default',
    badge: 1,
    channelId: 'orders',            // Android 8+ channel
    data: { orderId: 'ord_abc123' },
  }
);
// { data: [{ status: 'ok', id: 'xxxx-xxxx-xxxx' }] }
// null on network error or invalid token
```

### Build a platform-aware message

`buildMessage` applies sensible iOS and Android defaults and handles deep link injection:

```js
import { buildMessage, sendNotification } from './index.js';

const msg = buildMessage({
  to: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  title: 'New message',
  body: 'Alice sent you a message',
  deepLink: 'myapp://chat/room-456',  // merged into data.url automatically
  sound: 'default',
  badge: 3,
  channelId: 'messages',
  priority: 'high',                   // wakes Android doze mode via FCM high-priority
  color: '#FF6B35',                   // Android icon accent color
  subtitle: 'in #general',           // iOS banner subtitle (ignored on Android)
});

await sendNotification(msg.to, msg.body, msg);
```

### Send to multiple devices (batch)

`sendBatch` automatically chunks arrays into groups of 100 and returns a flat ticket array:

```js
import { buildMessage, sendBatch, createTokenRegistry } from './index.js';

const registry = createTokenRegistry();
// ... populate registry from DB ...

const messages = registry.getAllEntries().map(({ token }) =>
  buildMessage({
    to: token,
    title: 'Flash sale',
    body: '50% off everything — today only!',
    deepLink: 'myapp://sale',
    channelId: 'promotions',
  })
);

const tickets = await sendBatch(messages);
// [{ status: 'ok', id: 'aaa' }, { status: 'ok', id: 'bbb' }, ...]

// Save the ticket IDs to check receipts later
const ticketIds = tickets.filter((t) => t.status === 'ok').map((t) => t.id);
```

### Check delivery receipts

Receipts are typically available 15–30 minutes after sending. Check them to handle stale tokens and other errors:

```js
import { getReceipts, checkReceiptsForErrors, createTokenRegistry } from './index.js';

const registry = createTokenRegistry();

// Fetch receipts for saved ticket IDs
const receipts = await getReceipts(ticketIds);

// Inspect errors
const errors = checkReceiptsForErrors(receipts);
for (const err of errors) {
  console.log(err.receiptId, err.error, err.message);
  // err.error: 'DeviceNotRegistered' | 'MessageTooBig' | 'MessageRateExceeded' | 'InvalidCredentials'

  if (err.error === 'DeviceNotRegistered') {
    // Look up the token associated with this receipt ID in your DB, then:
    registry.unregister(userId, stalePushToken);
  }
}
```

### Deep link handling in your Expo app

```js
import { parseDeepLink } from './index.js';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

Notifications.addNotificationResponseReceivedListener((response) => {
  const url = response.notification.request.content.data?.url;
  if (!url) return;

  const link = parseDeepLink(url);
  if (!link) return;

  // Custom scheme: "myapp://order/123"
  if (link.scheme === 'myapp') {
    router.push(`${link.host}${link.pathname}`);
  }

  // Universal link: "https://myapp.com/order/123"
  if (link.scheme === 'https' && link.host === 'myapp.com') {
    router.push(link.pathname);
  }
});
```

### Validate a token before storing

```js
import { isExpoPushToken } from './index.js';

// Returns true only for 'ExponentPushToken[...]' and 'ExpoPushToken[...]' formats
if (!isExpoPushToken(tokenFromClient)) {
  return res.status(400).json({ error: 'invalid_push_token' });
}
```

### Find tickets that failed at send time

```js
import { findTicketErrors } from './index.js';

const tickets = await sendBatch(messages);
const errors = findTicketErrors(tickets);
// [{ index: 2, status: 'error', message: '...', details: { error: 'DeviceNotRegistered' } }]
```

## iOS vs Android Differences

| Feature | iOS | Android |
|---|---|---|
| Sound | `sound: 'default'` or custom filename | `sound: 'default'`; configure in channel |
| Badge count | `badge: N` updates app icon badge | Not supported |
| Notification channel | Ignored | Required on Android 8+ (`channelId`) |
| Subtitle | Shown in banner | Ignored |
| Icon color | Ignored | `color: '#rrggbb'` tints the status-bar icon |
| Wake from doze | Via APNs push | `priority: 'high'` sends FCM high-priority |
| Actionable categories | `categoryId` maps to `UNNotificationCategory` | Not supported via Expo |

## Edge Cases

- **DeviceNotRegistered** — APNs or FCM rejected the token (app uninstalled or token rotated). Call `registry.unregister` immediately; sending to stale tokens wastes your rate limit quota.
- **Receipts not yet available** — Expo processes receipts asynchronously. If a receipt ID is missing from the response, wait a few more minutes and retry.
- **100-message send limit** — `sendBatch` chunks automatically; batches are sent sequentially to avoid hammering the API. If any chunk fails the function returns null early.
- **1000-receipt fetch limit** — `getReceipts` also chunks automatically.
- **Silent notifications** — Set `sound: null` and omit `badge` for background data payloads. On iOS you must also enable the Background Modes capability and set `_contentAvailable: true` in the raw APNs payload (not currently exposed by Expo's push API).
- **Rate limiting** — Without `EXPO_ACCESS_TOKEN`, limits are shared across all unauthenticated callers on the same IP. Set the token in production. Back off on `MessageRateExceeded` receipts using exponential delay before retrying that specific device.
- **Token format drift** — Expo has used both `ExponentPushToken` and `ExpoPushToken` prefixes. `isExpoPushToken` accepts both; always call it before persisting tokens from clients.
- **15s timeout** — All fetch calls use `AbortSignal.timeout(15000)`. A null return always means something failed; check `console.error` output for details.
