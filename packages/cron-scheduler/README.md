# cron-scheduler

Cron expression parsing, next-run-time calculation, Vercel Cron config generation, route handler code generation, QStash publish/schedule helpers, and idempotency keys. Zero dependencies.

Covers the full lifecycle of scheduled jobs in a Next.js + Vercel stack: validate expressions, compute next fire times, wire up vercel.json, scaffold route handlers, and publish durably via Upstash QStash.

## Usage

### Validate a cron expression

```js
import { isValidCron, parseCron } from "./index.js";

isValidCron("0 */6 * * *");     // true — every 6 hours
isValidCron("60 * * * *");      // false — minute out of range

const parsed = parseCron("*/15 9-17 * * 1-5");
// {
//   minutes:  [0, 15, 30, 45],
//   hours:    [9, 10, 11, 12, 13, 14, 15, 16, 17],
//   days:     [1..31],
//   months:   [1..12],
//   weekdays: [1, 2, 3, 4, 5],   // Mon-Fri
//   raw: "*/15 9-17 * * 1-5"
// }
```

### Calculate next run time

```js
import { nextRunTime } from "./index.js";

const next = nextRunTime("0 9 * * 1");   // next Monday at 09:00
console.log(next.toISOString());         // e.g. "2026-04-13T09:00:00.000Z"

// Pass a pre-parsed expression to avoid re-parsing on every call
import { parseCron } from "./index.js";
const expr = parseCron("*/5 * * * *");
const upcoming = nextRunTime(expr, new Date("2026-04-08T14:03:00Z"));
// 2026-04-08T14:05:00.000Z
```

### Generate vercel.json cron config

```js
import { generateVercelCronConfig } from "./index.js";

const config = generateVercelCronConfig([
  { path: "/api/cron/cleanup",  schedule: "0 3 * * *"   },
  { path: "/api/cron/digest",   schedule: "0 9 * * 1-5" },
]);
// { crons: [ { path: "...", schedule: "..." }, ... ] }

// Merge into your existing vercel.json
import { readFileSync, writeFileSync } from "fs";
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
writeFileSync("vercel.json", JSON.stringify({ ...vercel, ...config }, null, 2));
```

### Scaffold a cron route handler

```js
import { generateCronRouteHandler } from "./index.js";
import { writeFileSync, mkdirSync } from "fs";

const src = generateCronRouteHandler("daily-cleanup", {
  handlerName: "GET",
  secret: "CRON_SECRET",    // name of the env var holding the secret
  idempotent: true,         // include idempotency-key deduplication
});

mkdirSync("app/api/cron/daily-cleanup", { recursive: true });
writeFileSync("app/api/cron/daily-cleanup/route.js", src);
```

The generated handler:

- Checks the `Authorization: Bearer $CRON_SECRET` header Vercel sends
- Deduplicates within the same minute using `generateIdempotencyKey`
- Returns structured JSON `{ ok: true }` / `{ ok: false, error }` responses

### Idempotency keys

```js
import { generateIdempotencyKey } from "./index.js";

// Returns the same key for any invocation within the same minute
const key = generateIdempotencyKey("send-digest", new Date());
// "send-digest::2026-04-08T09:00"

// Use as a DB insert guard, Redis key, or QStash deduplication ID
const alreadyRan = await redis.get(key);
if (!alreadyRan) {
  await doWork();
  await redis.set(key, "1", { ex: 3600 });
}
```

### Publish a one-off message via QStash

```js
import { qstashPublish } from "./index.js";

const result = await qstashPublish({
  token: process.env.QSTASH_TOKEN,
  url: "https://myapp.vercel.app/api/jobs/send-report",
  body: { reportId: "rpt_123", userId: "usr_456" },
  retries: 3,
  jobName: "send-report",   // auto-generates deduplication ID
});

if (!result) {
  // qstashPublish logged the error and returned null
}
// result => { messageId: "msg_..." }
```

### Create a repeating QStash schedule

```js
import { qstashSchedule } from "./index.js";

const schedule = await qstashSchedule({
  token: process.env.QSTASH_TOKEN,
  url: "https://myapp.vercel.app/api/cron/weekly-report",
  cron: "0 9 * * 1",          // every Monday at 09:00 UTC
  body: { type: "weekly" },
  retries: 3,
});
// schedule => { scheduleId: "scd_..." }
```

Calling `qstashSchedule` with the same `url` replaces the previous schedule (idempotent).

## Cron Expression Reference

```
┌───── minute      (0-59)
│ ┌─── hour        (0-23)
│ │ ┌─ day         (1-31)
│ │ │ ┌ month      (1-12)
│ │ │ │ ┌ weekday  (0-6, Sunday=0)
* * * * *
```

| Pattern       | Meaning                        |
|---------------|-------------------------------|
| `* * * * *`   | Every minute                  |
| `0 * * * *`   | Every hour                    |
| `0 */6 * * *` | Every 6 hours                 |
| `0 9 * * 1-5` | Weekdays at 09:00             |
| `*/15 * * * *`| Every 15 minutes              |
| `0 0 1 * *`   | First of every month at 00:00 |

## Setup

No installation required — copy `index.js` into your project. For QStash:

1. Create an [Upstash](https://upstash.com) account and a QStash token.
2. Set `QSTASH_TOKEN` in your environment.
3. Set `CRON_SECRET` to a random secret and configure it in Vercel project settings.

For Vercel Cron, add the generated `crons` array to `vercel.json` and deploy. Vercel will invoke your route handlers on schedule with the correct `Authorization` header.

## Edge Cases Handled

- **Out-of-range fields** — minute > 59, hour > 23, etc. cause `parseCron` to return null
- **Step of zero** — `*/0` is rejected as invalid
- **Month/weekday combined** — `nextRunTime` requires both day-of-month and weekday to match (standard cron semantics for single-token `*` fields)
- **Idempotency pruning** — the in-memory `seen` set in generated handlers is capped at 120 keys to prevent unbounded growth
- **QStash retries clamped** — retries are clamped to 0-5 (QStash maximum)
- **4-year safety cap** — `nextRunTime` stops searching after 4 years to avoid infinite loops on impossible expressions (e.g. `0 0 31 2 *`)
