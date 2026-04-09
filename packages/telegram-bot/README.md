# telegram-bot

Send text, Markdown, and HTML messages, inline keyboards, photos, and files via the Telegram Bot API. Includes webhook setup, secret verification, command routing, and group chat helpers. Zero dependencies.

## Setup

Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.

```bash
TELEGRAM_BOT_TOKEN=123456789:AAF...   # Token from BotFather
```

## Usage

### Send a Plain Text Message

```js
import { sendMessage } from "./index.js";

await sendMessage(process.env.TELEGRAM_BOT_TOKEN, CHAT_ID, "Hello from Beepack!");
```

### Send Markdown

```js
await sendMessage(process.env.TELEGRAM_BOT_TOKEN, CHAT_ID, "*Bold* and _italic_", {
  parseMode: "Markdown",
});
```

### Send HTML

```js
await sendMessage(process.env.TELEGRAM_BOT_TOKEN, CHAT_ID, "<b>Bold</b> and <i>italic</i>", {
  parseMode: "HTML",
});
```

### Inline Keyboard

```js
import { sendMessage, buildInlineKeyboard } from "./index.js";

const keyboard = buildInlineKeyboard([
  [
    { text: "Approve", callbackData: "approve:42" },
    { text: "Reject",  callbackData: "reject:42"  },
  ],
  [{ text: "View on site", url: "https://example.com/item/42" }],
]);

await sendMessage(process.env.TELEGRAM_BOT_TOKEN, CHAT_ID, "Review item #42", {
  replyMarkup: keyboard,
});
```

### Answer a Callback Query

When a user taps an inline button Telegram sends a `callback_query` update. You must answer it to dismiss the loading spinner.

```js
import { answerCallbackQuery } from "./index.js";

// Inside your webhook handler:
if (update.callback_query) {
  await answerCallbackQuery(
    process.env.TELEGRAM_BOT_TOKEN,
    update.callback_query.id,
    { text: "Done!", showAlert: false }
  );
}
```

### Send a Photo

```js
import { sendPhoto } from "./index.js";

await sendPhoto(process.env.TELEGRAM_BOT_TOKEN, CHAT_ID, "https://example.com/image.png", {
  caption: "Latest screenshot",
  parseMode: "HTML",
});
```

### Send a File / Document

```js
import { sendDocument } from "./index.js";

await sendDocument(process.env.TELEGRAM_BOT_TOKEN, CHAT_ID, "https://example.com/report.pdf", {
  caption: "Monthly report",
  filename: "report-2026-04.pdf",
});
```

### Register a Webhook

```js
import { setWebhook } from "./index.js";

await setWebhook(process.env.TELEGRAM_BOT_TOKEN, "https://yourapp.com/telegram/webhook", {
  secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
  allowedUpdates: ["message", "callback_query"],
});
```

### Verify Incoming Webhook Requests

Telegram can send a `X-Telegram-Bot-Api-Secret-Token` header to prove requests are genuine.

```js
import { verifyWebhookSecret } from "./index.js";

// Example: Next.js Route Handler
export async function POST(req) {
  const incoming = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!verifyWebhookSecret(incoming, process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }
  const update = await req.json();
  // ... handle update
  return new Response("OK");
}
```

### Command Routing

```js
import { createCommandRouter, sendMessage } from "./index.js";

const token = process.env.TELEGRAM_BOT_TOKEN;

const router = createCommandRouter({
  start: async (msg) => {
    await sendMessage(token, msg.chat.id, "Welcome! Type /help for a list of commands.");
  },
  help: async (msg) => {
    await sendMessage(token, msg.chat.id, "Commands:\n/start — welcome\n/help — this message", {
      parseMode: "HTML",
    });
  },
  echo: async (msg, args) => {
    await sendMessage(token, msg.chat.id, args.join(" ") || "(nothing to echo)");
  },
});

// Inside your webhook handler:
if (update.message) {
  await router(update.message);
}
```

### Group Chat Handling

```js
import { getChat, getChatMember, isBotAdmin, getMe } from "./index.js";

const token = process.env.TELEGRAM_BOT_TOKEN;

// Get group info
const chat = await getChat(token, GROUP_CHAT_ID);
console.log(chat.title, chat.memberCount);

// Check a user's status in the group
const member = await getChatMember(token, GROUP_CHAT_ID, USER_ID);
// member.status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked"

// Check if the bot is an admin (needed to delete messages, restrict users, etc.)
const me = await getMe(token);
const isAdmin = await isBotAdmin(token, GROUP_CHAT_ID, me.id);
```

### Edit a Message

```js
import { editMessage, buildInlineKeyboard } from "./index.js";

await editMessage(token, CHAT_ID, MESSAGE_ID, "Updated text", {
  parseMode: "HTML",
  replyMarkup: buildInlineKeyboard([[{ text: "Done", callbackData: "done" }]]),
});
```

## Edge Cases Handled

- **Constant-time secret comparison** — webhook secret verification resists timing attacks
- **Group vs private commands** — `parseCommand` strips `@BotUsername` from `/cmd@BotUsername` format used in groups
- **Null-safe throughout** — every API call returns `null` on error instead of throwing
- **15 s timeout** — all requests cancelled after 15 seconds via `AbortSignal.timeout`
- **Largest photo variant** — `sendPhoto` returns the `file_id` of the highest-resolution version
- **Command handler errors isolated** — a crashing command handler does not bubble up to the webhook loop
