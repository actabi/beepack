# stream-chat

Server-side wrapper for the Stream Chat API. Create channels, send messages, manage users, and generate auth tokens. Zero dependencies — uses native `fetch` and Web Crypto for JWT signing.

Source: [getstream/stream-chat-js](https://github.com/getstream/stream-chat-js) (205+ stars)

## Setup

```bash
STREAM_API_KEY=your-api-key       # Stream Chat API key
STREAM_API_SECRET=your-secret     # Stream Chat API secret
```

## Usage

### Generate User Token

```js
import { generateUserToken } from "./index.js";

const token = await generateUserToken(process.env.STREAM_API_SECRET, "user-123");
// Give this token to the client SDK for authentication
```

### Create Channel

```js
import { createChannel } from "./index.js";

const channel = await createChannel(process.env.STREAM_API_KEY, process.env.STREAM_API_SECRET, {
  type: "messaging",
  id: "general",
  createdBy: "admin",
  name: "General Chat",
  members: ["alice", "bob"],
});
// { channel: { id, type, cid, name }, members: [...] }
```

### Send Message

```js
import { sendMessage } from "./index.js";

const msg = await sendMessage(process.env.STREAM_API_KEY, process.env.STREAM_API_SECRET, {
  channelType: "messaging",
  channelId: "general",
  userId: "alice",
  text: "Hello everyone!",
});
// { id: "msg_abc", text: "Hello everyone!", createdAt: "..." }
```

### Get Channel with Messages

```js
import { getChannel } from "./index.js";

const data = await getChannel(
  process.env.STREAM_API_KEY,
  process.env.STREAM_API_SECRET,
  "messaging",
  "general",
  10
);
// { channel: { id, name, memberCount }, messages: [...] }
```

### Query Users

```js
import { queryUsers } from "./index.js";

const users = await queryUsers(
  process.env.STREAM_API_KEY,
  process.env.STREAM_API_SECRET,
  { id: { $in: ["alice", "bob"] } }
);
// [{ id: "alice", name: "Alice", online: true, lastActive: "..." }]
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `STREAM_API_KEY` | Stream Chat API key from dashboard |
| `STREAM_API_SECRET` | Stream Chat API secret for server-side auth |
