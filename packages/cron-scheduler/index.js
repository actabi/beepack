// Cron Scheduler
// Zero dependencies. Cron expression parsing, next-run calculation, Vercel config
// generation, route handler code generation, QStash publish helpers, and idempotency keys.

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const TAG = "[cron-scheduler]";

/**
 * Parse an integer range field from a cron expression token.
 * Handles: "*", "5", "1-5", "* /5" (step), "1-5/2".
 *
 * @param {string} token - Single cron field token
 * @param {number} min - Minimum allowed value for this field
 * @param {number} max - Maximum allowed value for this field
 * @returns {number[]|null} Sorted array of matching values, or null on error
 */
function parseField(token, min, max) {
  const values = new Set();

  for (const part of token.split(",")) {
    const stepMatch = part.match(/^(.+?)\/(\d+)$/);
    let range = stepMatch ? stepMatch[1] : part;
    const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;

    if (step < 1) return null;

    let lo = min;
    let hi = max;

    if (range !== "*") {
      const dashMatch = range.match(/^(\d+)-(\d+)$/);
      if (dashMatch) {
        lo = parseInt(dashMatch[1], 10);
        hi = parseInt(dashMatch[2], 10);
      } else if (/^\d+$/.test(range)) {
        lo = hi = parseInt(range, 10);
      } else {
        return null;
      }
    }

    if (lo < min || hi > max || lo > hi) return null;

    for (let v = lo; v <= hi; v += step) {
      values.add(v);
    }
  }

  return [...values].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Public: Cron expression parser / validator
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ParsedCron
 * @property {number[]} minutes  - Matching minute values (0-59)
 * @property {number[]} hours    - Matching hour values (0-23)
 * @property {number[]} days     - Matching day-of-month values (1-31)
 * @property {number[]} months   - Matching month values (1-12)
 * @property {number[]} weekdays - Matching weekday values (0-6, Sunday=0)
 * @property {string}   raw      - Original expression string
 */

/**
 * Parse and validate a standard 5-field cron expression.
 *
 * Fields: minute hour day-of-month month day-of-week
 * Supports: "*", numbers, ranges (1-5), steps (* /5, 1-5/2), lists (1,3,5).
 *
 * @param {string} expression - Cron expression, e.g. "0 * /6 * * *"
 * @returns {ParsedCron|null} Parsed fields, or null if the expression is invalid
 */
export function parseCron(expression) {
  if (typeof expression !== "string") {
    console.error(`${TAG} parseCron: expression must be a string`);
    return null;
  }

  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    console.error(`${TAG} parseCron: expected 5 fields, got ${fields.length} in "${expression}"`);
    return null;
  }

  const [minuteToken, hourToken, dayToken, monthToken, weekdayToken] = fields;

  const minutes  = parseField(minuteToken,  0,  59);
  const hours    = parseField(hourToken,    0,  23);
  const days     = parseField(dayToken,     1,  31);
  const months   = parseField(monthToken,   1,  12);
  const weekdays = parseField(weekdayToken, 0,   6);

  if (!minutes || !hours || !days || !months || !weekdays) {
    console.error(`${TAG} parseCron: invalid expression "${expression}"`);
    return null;
  }

  return { minutes, hours, days, months, weekdays, raw: expression.trim() };
}

/**
 * Validate a cron expression without returning parsed fields.
 *
 * @param {string} expression - Cron expression to validate
 * @returns {boolean} True if valid
 */
export function isValidCron(expression) {
  return parseCron(expression) !== null;
}

// ---------------------------------------------------------------------------
// Public: Next-run-time calculator
// ---------------------------------------------------------------------------

/**
 * Calculate the next Date at which a cron expression will fire,
 * starting from (but not including) the given reference Date.
 *
 * @param {string|ParsedCron} expression - Cron expression string or pre-parsed result
 * @param {Date} [from=new Date()] - Reference point (defaults to now)
 * @returns {Date|null} Next scheduled Date, or null if expression is invalid or no run found within 4 years
 */
export function nextRunTime(expression, from = new Date()) {
  const parsed = typeof expression === "string" ? parseCron(expression) : expression;
  if (!parsed) return null;

  // Advance by one minute so we never return the reference time itself
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  // Safety cap: search up to ~4 years ahead (2,102,400 minutes)
  const limit = new Date(from.getTime() + 4 * 365 * 24 * 60 * 60 * 1000);

  while (cursor < limit) {
    const month   = cursor.getMonth() + 1; // 1-12
    const day     = cursor.getDate();       // 1-31
    const weekday = cursor.getDay();        // 0-6
    const hour    = cursor.getHours();
    const minute  = cursor.getMinutes();

    if (!parsed.months.includes(month)) {
      // Jump to the first day of the next matching month
      const nextMonth = parsed.months.find((m) => m > month) ?? parsed.months[0];
      const yearDelta = nextMonth <= month ? 1 : 0;
      cursor.setFullYear(cursor.getFullYear() + yearDelta, nextMonth - 1, 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    if (!parsed.days.includes(day) || !parsed.weekdays.includes(weekday)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    if (!parsed.hours.includes(hour)) {
      const nextHour = parsed.hours.find((h) => h > hour);
      if (nextHour == null) {
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(0, 0, 0, 0);
      } else {
        cursor.setHours(nextHour, parsed.minutes[0], 0, 0);
      }
      continue;
    }

    const nextMinute = parsed.minutes.find((m) => m >= minute);
    if (nextMinute == null) {
      const nextHour = parsed.hours.find((h) => h > hour);
      if (nextHour == null) {
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(0, 0, 0, 0);
      } else {
        cursor.setHours(nextHour, parsed.minutes[0], 0, 0);
      }
      continue;
    }

    // If we landed on the exact reference minute, we already advanced so it's fine
    cursor.setMinutes(nextMinute, 0, 0);
    return new Date(cursor.getTime());
  }

  console.error(`${TAG} nextRunTime: no run time found within 4 years for "${parsed.raw}"`);
  return null;
}

// ---------------------------------------------------------------------------
// Public: Vercel Cron config generator
// ---------------------------------------------------------------------------

/**
 * @typedef {object} VercelCronJob
 * @property {string} path  - URL path the cron POSTs to (e.g. "/api/cron/cleanup")
 * @property {string} schedule - Cron expression
 */

/**
 * Generate a vercel.json-compatible crons configuration object.
 * Only expressions valid per Vercel's supported subset are accepted (5-field standard cron).
 *
 * @param {VercelCronJob[]} jobs - Array of cron job definitions
 * @returns {{ crons: VercelCronJob[] }|null} Config object ready for vercel.json, or null on error
 */
export function generateVercelCronConfig(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    console.error(`${TAG} generateVercelCronConfig: jobs must be a non-empty array`);
    return null;
  }

  const validated = [];
  for (const job of jobs) {
    if (typeof job.path !== "string" || !job.path.startsWith("/")) {
      console.error(`${TAG} generateVercelCronConfig: job path must start with "/", got "${job.path}"`);
      return null;
    }
    if (!isValidCron(job.schedule)) {
      console.error(`${TAG} generateVercelCronConfig: invalid cron schedule "${job.schedule}" for path "${job.path}"`);
      return null;
    }
    validated.push({ path: job.path, schedule: job.schedule });
  }

  return { crons: validated };
}

// ---------------------------------------------------------------------------
// Public: Route handler source generator
// ---------------------------------------------------------------------------

/**
 * @typedef {object} RouteHandlerOptions
 * @property {string} handlerName - Name for the exported handler function
 * @property {string} [secret]    - Environment variable name holding the cron secret (default: "CRON_SECRET")
 * @property {boolean} [idempotent=true] - Whether to include idempotency-key checks
 */

/**
 * Generate source code for a Next.js App Router route handler that responds
 * to Vercel Cron invocations. The output is a self-contained string you can
 * write to `app/api/cron/<name>/route.js`.
 *
 * @param {string} jobName - Human-readable job name used in log messages
 * @param {RouteHandlerOptions} [options]
 * @returns {string|null} Source code string, or null on error
 */
export function generateCronRouteHandler(jobName, options = {}) {
  if (typeof jobName !== "string" || !jobName.trim()) {
    console.error(`${TAG} generateCronRouteHandler: jobName must be a non-empty string`);
    return null;
  }

  const {
    handlerName = "GET",
    secret = "CRON_SECRET",
    idempotent = true,
  } = options;

  const idempotencyBlock = idempotent
    ? `
  // Idempotency: reject duplicate invocations within the same minute
  const idempotencyKey = generateIdempotencyKey("${jobName}", new Date());
  if (seen.has(idempotencyKey)) {
    return new Response("Already processed", { status: 200 });
  }
  seen.add(idempotencyKey);
  // Prune old keys to prevent unbounded growth (keep last 120)
  if (seen.size > 120) {
    const [oldest] = seen;
    seen.delete(oldest);
  }
`
    : "";

  const seenDeclaration = idempotent
    ? `import { generateIdempotencyKey } from "../../../cron-scheduler/index.js";\n\nconst seen = new Set();\n\n`
    : "";

  return `${seenDeclaration}export async function ${handlerName}(request) {
  // Verify the request comes from Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== \`Bearer \${process.env.${secret}}\`) {
    return new Response("Unauthorized", { status: 401 });
  }
${idempotencyBlock}
  try {
    // TODO: implement "${jobName}" job logic here
    console.log("[cron] ${jobName} started");

    // ... your job code ...

    console.log("[cron] ${jobName} completed");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron] ${jobName} failed:", err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
`;
}

// ---------------------------------------------------------------------------
// Public: Idempotency key generator
// ---------------------------------------------------------------------------

/**
 * Generate a stable idempotency key for a named cron job at a given time.
 * Keys are minute-granular so the same job fired twice within one minute
 * produces the same key, enabling safe deduplication.
 *
 * @param {string} jobName - Unique job identifier
 * @param {Date} [at=new Date()] - Time of invocation (defaults to now)
 * @returns {string} Idempotency key string, e.g. "cleanup::2026-04-08T14:05"
 */
export function generateIdempotencyKey(jobName, at = new Date()) {
  const iso = at.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
  return `${jobName}::${iso}`;
}

// ---------------------------------------------------------------------------
// Public: QStash publish helper
// ---------------------------------------------------------------------------

/**
 * @typedef {object} QStashPublishOptions
 * @property {string} token         - Upstash QStash token (from QSTASH_TOKEN env var)
 * @property {string} url           - Publicly reachable destination URL for the job
 * @property {object|string} [body] - JSON-serialisable payload or raw string body
 * @property {string} [cron]        - Cron expression to schedule repeating delivery
 * @property {number} [retries=3]   - QStash delivery retry count (0-5)
 * @property {string} [deduplicationId] - Custom deduplication ID (uses idempotency key by default)
 * @property {string} [jobName]     - Job name used when auto-generating the deduplication ID
 */

/**
 * Publish a message to Upstash QStash for durable, at-least-once delivery.
 * Supports one-off scheduling and repeating cron-based schedules.
 *
 * @param {QStashPublishOptions} options
 * @returns {Promise<{messageId: string, scheduleId?: string}|null>} QStash response, or null on error
 */
export async function qstashPublish(options) {
  const {
    token,
    url,
    body,
    cron,
    retries = 3,
    deduplicationId,
    jobName,
  } = options ?? {};

  if (!token) {
    console.error(`${TAG} qstashPublish: token is required`);
    return null;
  }
  if (!url) {
    console.error(`${TAG} qstashPublish: url is required`);
    return null;
  }
  if (cron && !isValidCron(cron)) {
    console.error(`${TAG} qstashPublish: invalid cron expression "${cron}"`);
    return null;
  }

  const dedupId =
    deduplicationId ??
    (jobName ? generateIdempotencyKey(jobName) : undefined);

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Upstash-Retries": String(Math.max(0, Math.min(5, retries))),
  };

  if (cron) headers["Upstash-Cron"] = cron;
  if (dedupId) headers["Upstash-Deduplication-Id"] = dedupId;

  let rawBody;
  if (body !== undefined) {
    rawBody = typeof body === "string" ? body : JSON.stringify(body);
  }

  try {
    const res = await fetch("https://qstash.upstash.io/v2/publish/" + encodeURIComponent(url), {
      method: "POST",
      headers,
      body: rawBody,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`${TAG} qstashPublish: QStash returned ${res.status}: ${text}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`${TAG} qstashPublish: fetch failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public: QStash schedule helper (create/update a named repeating schedule)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} QStashScheduleOptions
 * @property {string} token      - Upstash QStash token
 * @property {string} url        - Destination URL
 * @property {string} cron       - Cron expression for the schedule
 * @property {object|string} [body] - Payload forwarded on each invocation
 * @property {number} [retries=3]  - Delivery retry count
 */

/**
 * Create or replace a named QStash schedule (Upstash /v2/schedules endpoint).
 * Idempotent: calling with the same parameters replaces the previous schedule.
 *
 * @param {QStashScheduleOptions} options
 * @returns {Promise<{scheduleId: string}|null>} Schedule response or null on error
 */
export async function qstashSchedule(options) {
  const { token, url, cron, body, retries = 3 } = options ?? {};

  if (!token) {
    console.error(`${TAG} qstashSchedule: token is required`);
    return null;
  }
  if (!url) {
    console.error(`${TAG} qstashSchedule: url is required`);
    return null;
  }
  if (!cron || !isValidCron(cron)) {
    console.error(`${TAG} qstashSchedule: valid cron expression is required, got "${cron}"`);
    return null;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Upstash-Cron": cron,
    "Upstash-Retries": String(Math.max(0, Math.min(5, retries))),
  };

  let rawBody;
  if (body !== undefined) {
    rawBody = typeof body === "string" ? body : JSON.stringify(body);
  }

  try {
    const res = await fetch("https://qstash.upstash.io/v2/schedules/" + encodeURIComponent(url), {
      method: "POST",
      headers,
      body: rawBody,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`${TAG} qstashSchedule: QStash returned ${res.status}: ${text}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`${TAG} qstashSchedule: fetch failed: ${err.message}`);
    return null;
  }
}
