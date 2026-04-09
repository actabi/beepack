# discord-bot

Send messages, rich embeds, and webhooks via the Discord API. Includes Ed25519 interaction verification for slash commands. Zero dependencies.

## Setup

```bash
DISCORD_BOT_TOKEN=MTIz...   # Bot token from Discord Developer Portal
DISCORD_PUBLIC_KEY=abc...    # Application public key (for interactions)
```

## Usage

### Send a Message

```js
import { sendMessage } from "./index.js";

await sendMessage(process.env.DISCORD_BOT_TOKEN, "123456789", {
  content: "Hello from Beepack!",
});
```

### Send a Rich Embed

```js
import { sendMessage, buildEmbed } from "./index.js";

const embed = buildEmbed({
  title: "Server Status",
  description: "All systems operational",
  color: 0x00ff00,
  fields: [
    { name: "Uptime", value: "99.9%", inline: true },
    { name: "Response Time", value: "45ms", inline: true },
  ],
  footer: { text: "Updated just now" },
  timestamp: new Date().toISOString(),
});

await sendMessage(process.env.DISCORD_BOT_TOKEN, "123456789", {
  embeds: [embed],
});
```

### Discord Webhook (No Bot Token)

```js
import { executeWebhook } from "./index.js";

await executeWebhook("https://discord.com/api/webhooks/123/abc", {
  content: "Deployment complete!",
  username: "Deploy Bot",
  embeds: [buildEmbed({ title: "v2.0 Released", color: 0x5865f2 })],
});
```

### Verify Slash Command Interactions

```js
import { verifyInteraction } from "./index.js";

// In your HTTP endpoint handler
app.post("/interactions", async (req, res) => {
  const isValid = await verifyInteraction(
    process.env.DISCORD_PUBLIC_KEY,
    req.headers["x-signature-ed25519"],
    req.headers["x-signature-timestamp"],
    JSON.stringify(req.body)
  );

  if (!isValid) return res.status(401).send("Invalid signature");

  // Handle PING
  if (req.body.type === 1) return res.json({ type: 1 });

  // Handle commands...
});
```

### React to a Message

```js
import { addReaction } from "./index.js";

await addReaction(process.env.DISCORD_BOT_TOKEN, channelId, messageId, "%F0%9F%91%8D");
```

## Edge Cases Handled

- **Ed25519 verification** — proper signature verification using Web Crypto API
- **API v10** — uses the latest stable Discord API version
- **Webhook vs Bot** — separate functions for webhook (no auth) and bot token (auth) flows
- **Rate limit awareness** — 15s timeout, returns null instead of throwing
- **Embed builder** — type-safe embed construction with all optional fields
