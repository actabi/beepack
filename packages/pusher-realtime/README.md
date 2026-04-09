# pusher-realtime

Zero-dependency server-side [Pusher](https://github.com/pusher/pusher-js) HTTP API client for triggering realtime events and querying channel state. Uses HMAC-SHA256 authentication signatures and native `fetch`.

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `PUSHER_APP_ID` | Pusher application ID | Yes |
| `PUSHER_KEY` | Pusher application key | Yes |
| `PUSHER_SECRET` | Pusher application secret for HMAC signing | Yes |
| `PUSHER_CLUSTER` | Pusher cluster (e.g. `us2`, `eu`, `ap1`) | Yes |

## Exported Functions

### `triggerEvent(channels, eventName, data, socketId?)`

Trigger an event on one or more channels.

```js
import { triggerEvent } from './index.js';
await triggerEvent('my-channel', 'my-event', { message: 'hello' });
// Trigger on multiple channels
await triggerEvent(['channel-1', 'channel-2'], 'update', { value: 42 });
```

### `triggerBatch(batch)`

Trigger up to 10 events in a single API call.

```js
import { triggerBatch } from './index.js';
await triggerBatch([
  { channel: 'ch-1', name: 'evt-a', data: { x: 1 } },
  { channel: 'ch-2', name: 'evt-b', data: { x: 2 } },
]);
```

### `getChannelInfo(channel, options?)`

Get information about a channel including occupancy and subscription counts.

```js
import { getChannelInfo } from './index.js';
const info = await getChannelInfo('my-channel');
console.log(info.occupied);
```

### `getPresenceUsers(channel)`

List users subscribed to a presence channel.

```js
import { getPresenceUsers } from './index.js';
const { users } = await getPresenceUsers('presence-room');
users.forEach(u => console.log(u.id));
```

## Notes

- All requests are signed with HMAC-SHA256 per the Pusher HTTP API spec.
- All fetch calls use `AbortSignal.timeout(15000)` (15 s).
- Returns `null` on network failures; throws on invalid arguments.
- Uses only `node:crypto` (built-in) -- no third-party dependencies.
