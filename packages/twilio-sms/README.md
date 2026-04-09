# twilio-sms

Send SMS and WhatsApp messages via Twilio, verify phone numbers with OTP, handle delivery status webhooks, enforce opt-out compliance (STOP/START), and validate webhook signatures. Zero dependencies.

## Setup

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
```

Get both values from your [Twilio Console](https://console.twilio.com/). You also need at least one Twilio phone number capable of SMS.

## Usage

### Send an SMS

```js
import { sendSMS } from "./index.js";

const result = await sendSMS(
  { accountSid: process.env.TWILIO_ACCOUNT_SID, authToken: process.env.TWILIO_AUTH_TOKEN },
  {
    to: "+14155552671",          // E.164 or common formats — normalized automatically
    from: "+18005551234",        // Your Twilio number
    body: "Hello from Beepack!",
    statusCallback: "https://yourapp.com/webhooks/twilio-status",
  }
);
// { sid: "SMxxxxxxx", status: "queued", to: "+14155552671" }
```

Pass a `messagingServiceSid` instead of `from` to use a Twilio Messaging Service (recommended for high-volume sending):

```js
await sendSMS(creds, {
  to: "415-555-2671",           // dashes/spaces stripped automatically
  messagingServiceSid: "MGxxxxxxx",
  body: "Your order has shipped.",
});
```

### Send a WhatsApp Message

Requires a Twilio number approved for WhatsApp (or the sandbox for testing).

```js
import { sendWhatsApp } from "./index.js";

await sendWhatsApp(creds, {
  to: "+14155552671",
  from: "+14155550000",          // your WhatsApp-enabled Twilio number
  body: "Hello from WhatsApp!",
  mediaUrl: "https://example.com/image.jpg",  // optional
});
// { sid: "MMxxxxxxx", status: "queued", to: "whatsapp:+14155552671" }
```

### OTP / Twilio Verify

Create a Verify service in the [Twilio Console](https://console.twilio.com/us1/develop/verify/services) to get a `VAxxxxxxx` SID.

```js
import { sendOTP, verifyOTP } from "./index.js";

// 1. Send the code
const sent = await sendOTP(creds, {
  serviceSid: "VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  to: "+14155552671",
  channel: "sms",    // "sms" | "whatsapp" | "email" | "call"
  locale: "en",      // optional BCP-47 locale
});
// { sid: "VExxxxxxx", status: "pending", to: "+14155552671" }

// 2. Verify the code the user entered
const check = await verifyOTP(creds, {
  serviceSid: "VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  to: "+14155552671",
  code: "123456",
});
// { valid: true, status: "approved" }
// { valid: false, status: "pending" }  — wrong code
```

### Delivery Status Webhooks

Point your Twilio number's Status Callback URL to your server, then parse the payload:

```js
import { parseDeliveryWebhook } from "./index.js";

// In your POST /webhooks/twilio-status handler:
const event = parseDeliveryWebhook(req.body); // raw string or URLSearchParams
// {
//   messageSid: "SMxxxxxxx",
//   status: "delivered",     // queued | sent | delivered | undelivered | failed
//   to: "+14155552671",
//   from: "+18005551234",
//   errorCode: null,
//   errorMessage: null,
//   timestamp: null
// }

if (event.status === "failed" || event.status === "undelivered") {
  // retry or alert
}
```

### Opt-out / Opt-in Compliance (STOP handling)

Twilio auto-handles STOP for you at the carrier level, but you must also maintain your own suppression list for TCPA compliance.

```js
import { parseInboundSMS } from "./index.js";

// In your POST /webhooks/twilio-inbound handler:
const inbound = parseInboundSMS(req.body);
// {
//   from: "+14155552671",
//   to: "+18005551234",
//   body: "STOP",
//   messageSid: "SMxxxxxxx",
//   optAction: "stop"   // "stop" | "start" | null
// }

if (inbound.optAction === "stop") {
  await db.optOuts.add(inbound.from);
}
if (inbound.optAction === "start") {
  await db.optOuts.remove(inbound.from);
}
```

Check before every send:

```js
const isOptedOut = await db.optOuts.has(normalizePhone(recipientPhone));
if (!isOptedOut) {
  await sendSMS(creds, { ... });
}
```

### Webhook Signature Verification

Always verify the `X-Twilio-Signature` header before processing webhooks to prevent spoofing.

```js
import { verifyWebhookSignature } from "./index.js";

// In your Express/Fastify/etc. route handler:
const isValid = await verifyWebhookSignature({
  authToken: process.env.TWILIO_AUTH_TOKEN,
  signature: req.headers["x-twilio-signature"],
  url: "https://yourapp.com/webhooks/twilio-inbound",  // must match exactly, including protocol
  body: req.body,   // raw string or URLSearchParams
});

if (!isValid) {
  return res.status(403).send("Forbidden");
}
```

### Phone Number Normalization

`normalizePhone` is exported for use outside of send calls:

```js
import { normalizePhone } from "./index.js";

normalizePhone("(415) 555-2671")   // "+14155552671"
normalizePhone("415-555-2671")     // "+14155552671"
normalizePhone("+44 20 7946 0958") // "+442079460958"
normalizePhone("not-a-number")     // null
```

## Edge Cases Handled

- **E.164 normalization** — strips spaces, dashes, parens; assumes +1 for bare 10-digit US numbers
- **WhatsApp prefix** — `whatsapp:` prefix added/stripped automatically so callers can pass either form
- **Carrier blocks / invalid numbers** — Twilio error codes logged, null returned; callers should check the `errorCode` field in delivery webhooks and remove undeliverable numbers
- **OTP email channel** — skips phone normalization when `@` is detected in the `to` field
- **Webhook signature** — uses Web Crypto API (HMAC-SHA1) available natively in Node 18+, no dependencies
- **Opt-out keywords** — recognizes all CTIA-required STOP variants: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT; START variants: START, UNSTOP, YES
- **Network failures** — 15s timeout via `AbortSignal.timeout`, returns null instead of throwing
