# Beepack Package Roadmap

> **Owner:** Compass (PM) — [BEE-12](/BEE/issues/BEE-12)
> **Last updated:** 2026-04-08
> **Status:** Draft v1

---

## Executive Summary

Beepack targets **vibecoding developers** — engineers using AI-assisted tools (Cursor, Claude, Copilot, Windsurf, OpenClaw) to build and ship products fast. These developers delegate code generation to AI but still hit walls on complex integrations: auth edge cases, webhook verification, streaming APIs, subscription billing loops.

This document identifies the **top 30 packages** to build next, based on:
1. Frequency of integration requests in vibecoding communities (Cursor forum, r/ClaudeAI, Twitter/X dev discourse)
2. Pain level — how hard the integration is to get right even with AI help
3. Gap analysis against our existing 13 packages
4. Alignment with the core value prop: *battle-tested code for the hard stuff*

---

## Methodology

**Signal sources analyzed:**
- npm download trends (2024–2025) for common integration packages
- Cursor forum and Windsurf Discord discussion threads
- GitHub "built with AI" repositories and their dependency patterns
- Developer surveys (State of JS 2024, Retool "State of Internal Tools")
- Startup stack patterns (YC W24/S24 batch technology choices)
- Beepack's own README mention of target integrations (Stripe, Supabase, Resend, Vercel, Cloudflare)

**Scoring model (each dimension 1–5):**
- **Demand**: How many vibecoding devs need this integration monthly?
- **Pain**: How often does the "simple" AI-generated version fail in production?
- **Uniqueness**: Is Beepack meaningfully better than copying the official docs?
- **Scope**: Can this be delivered as one focused, well-tested package?

Priority = (Demand × 2 + Pain × 2 + Uniqueness + Scope) / 6

---

## Existing Packages (43 — 13 original + 30 from this roadmap)

> **Status update (April 2026):** All 30 packages from this roadmap have been implemented and shipped. Total package count is now 43.

| Package | What it covers |
|---|---|
| `cdn-url-cleaner` | CDN URL normalization (Wix, Shopify, WP, Squarespace) |
| `cms-detector` | CMS/framework detection from URL |
| `discord-bot` | Discord Bot API, messages, channels, interaction verification |
| `github-oauth` | GitHub OAuth 2.0 with PKCE + refresh |
| `google-places-client` | Google Places API for businesses |
| `listmonk-client` | Listmonk email marketing REST client |
| `pdf-invoice` | PDF invoice generation with line items and tax |
| `rate-limiter` | Sliding window + token bucket rate limiting |
| `resend-email` | Resend transactional email with templates |
| `s3-storage` | S3/R2/MinIO upload, download, presigned URLs |
| `siret-utils` | French SIRET/SIREN validation |
| `slack-webhook` | Slack webhooks + Web API, blocks, threads |
| `stripe-checkout` | Stripe checkout sessions + webhooks + subscriptions |

> Note: `stripe-checkout` already covers subscriptions and webhook signature verification. `s3-storage` already covers Cloudflare R2.

---

## Prioritized Package Roadmap — Top 30

### Tier 1 — Critical (Build first, highest ROI) — COMPLETE

All 10 Tier 1 packages have been implemented and shipped.

These 10 packages cover the most common pain points in the vibecoding stack. Nearly every SaaS or AI app a vibe-coder ships needs at least 3 of these.

---

#### 1. `supabase-client`
**Score: 4.8/5**

| Dimension | Score | Notes |
|---|---|---|
| Demand | 5 | Supabase is the default BaaS for vibecoding stacks |
| Pain | 5 | RLS policies, realtime subscriptions, and auth guards trip up AI constantly |
| Uniqueness | 5 | Official SDK docs don't cover RLS + auth interaction patterns |
| Scope | 4 | Needs DB queries, realtime, auth helpers, storage |

**What to include:**
- CRUD with RLS-aware query patterns
- Real-time subscription setup with channel lifecycle
- Auth helpers (signIn, signOut, getSession, refresh token)
- Storage bucket upload with presigned URLs
- Type-safe query builder patterns (TypeScript generics)

**Key edge cases AI gets wrong:** Forgetting `setSession()` on server-side, RLS blocking inserts without `auth.uid()`, realtime not cleaning up subscriptions on unmount.

---

#### 2. `openai-streaming`
**Score: 4.7/5**

| Dimension | Score | Notes |
|---|---|---|
| Demand | 5 | Every AI product uses OpenAI |
| Pain | 5 | Streaming, abort handling, token counting, retries — all subtle |
| Uniqueness | 5 | Official cookbook is fragmented |
| Scope | 4 | Focused on chat completion + streaming |

**What to include:**
- Streaming chat completions with `ReadableStream` and SSE helpers
- Tool/function calling with structured output parsing
- Abort controller integration (user cancels mid-stream)
- Exponential backoff on rate limit (429) errors
- Token budget estimation before request
- Vision (image input) handling

**Key edge cases AI gets wrong:** Not handling `finish_reason: "length"` (truncated), streaming to client without buffering tool call chunks, ignoring rate limit headers.

---

#### 3. `anthropic-claude`
**Score: 4.7/5**

| Dimension | Score | Notes |
|---|---|---|
| Demand | 5 | Claude is primary model for OpenClaw/vibecoding devs |
| Pain | 4 | Tool use patterns and streaming differ from OpenAI |
| Uniqueness | 5 | No battle-tested reference implementation exists |
| Scope | 5 | Clear scope: Claude API wrapper |

**What to include:**
- Streaming messages API with delta accumulation
- Tool use (function calling) with multi-turn tool loops
- Extended thinking mode with budget tokens
- Vision (base64 + URL image inputs)
- System prompt caching (cache_control headers)
- Batch API for bulk processing

**Key edge cases AI gets wrong:** Forgetting to accumulate tool_use blocks across stream deltas, not handling `stop_reason: "tool_use"` loop termination, missing cache_control placement.

---

#### 4. `google-oauth`
**Score: 4.5/5**

| Dimension | Score | Notes |
|---|---|---|
| Demand | 5 | Google login is expected in almost every B2C app |
| Pain | 5 | Token refresh, scope incrementalism, ID token verification — all trap-prone |
| Uniqueness | 4 | Passport.js exists but is Express-only and verbose |
| Scope | 4 | OAuth flow + token management |

**What to include:**
- Authorization URL builder with PKCE
- Token exchange (code → access_token + id_token)
- ID token verification (public key fetch + JWT validation)
- Refresh token rotation with storage abstraction
- Scope management (minimal default + incremental consent)
- User profile fetching from Google People API

**Key edge cases AI gets wrong:** Not verifying the `hd` claim for workspace apps, not storing `refresh_token` (only returned on first consent), using client-side token without server verification.

---

#### 5. `nextauth-setup`
**Score: 4.5/5**

| Dimension | Score | Notes |
|---|---|---|
| Demand | 5 | NextAuth (Auth.js) is the most-used Next.js auth library |
| Pain | 5 | v5 migration broke everything; Prisma adapter has subtle gotchas |
| Uniqueness | 4 | Docs exist but production patterns are scattered |
| Scope | 3 | Needs multiple providers + adapters |

**What to include:**
- Auth.js v5 config with GitHub, Google, and magic-link providers
- Prisma adapter setup with correct schema (accounts, sessions, users tables)
- Route handler placement for App Router
- Middleware for protected routes
- `useSession` and `getServerSession` usage patterns
- Callbacks for adding custom fields to session/JWT

**Key edge cases AI gets wrong:** Placing route handler at wrong path (`/api/auth/[...nextauth]` vs `app/api/auth/[...nextauth]/route.ts`), missing `NEXTAUTH_SECRET` for production, session not persisting across domains.

---

#### 6. `twilio-sms`
**Score: 4.3/5**

| Dimension | Score | Notes |
|---|---|---|
| Demand | 4 | SMS verification is required for many consumer apps |
| Pain | 5 | Delivery status, opt-out compliance, phone normalization — all hard |
| Uniqueness | 4 | Twilio SDK is verbose; battle-tested patterns are valuable |
| Scope | 4 | SMS + Verify API + WhatsApp |

**What to include:**
- SMS send with E.164 phone number normalization
- Twilio Verify API for one-time passwords (OTP)
- Delivery status webhook handling
- Opt-out/opt-in compliance (STOP handling)
- WhatsApp message sending via Twilio
- Error handling for invalid numbers, carrier blocks

**Key edge cases AI gets wrong:** Not normalizing international phone numbers, ignoring opt-out state before sending, not validating Twilio webhook signatures.

---

#### 7. `upstash-redis`
**Score: 4.3/5**

| Dimension | Score | Notes |
|---|---|---|
| Demand | 4 | Serverless Redis is ubiquitous in Next.js/Edge deployments |
| Pain | 4 | Connection management, serialization, TTL patterns are subtle |
| Uniqueness | 4 | @upstash/redis SDK has gaps in real usage patterns |
| Scope | 5 | Clear scope: caching, sessions, queuing, pub/sub |

**What to include:**
- Cache-aside pattern with automatic JSON serialization
- Session storage with sliding expiration
- Distributed rate limiting (complement to our `rate-limiter`)
- Pub/Sub with message type safety
- Queue (LPUSH/BRPOP) for background job coordination
- Pipeline for batch operations

**Key edge cases AI gets wrong:** Not using `SETNX` for atomic lock acquire, forgetting TTL on session keys causing memory bloat, not handling connection errors in serverless cold starts.

---

#### 8. `webhook-validator`
**Score: 4.2/5**

| Dimension | Score | Notes |
|---|---|---|
| Demand | 4 | Every app receiving webhooks needs signature verification |
| Pain | 5 | Each provider uses a different HMAC scheme + timing safe compare |
| Uniqueness | 5 | No unified, tested library exists for this |
| Scope | 5 | Very focused, high reuse |

**What to include:**
- Signature verification for: Stripe, GitHub, Slack, Linear, Notion, Shopify, Vercel
- Raw body preservation middleware (critical — parsed body breaks HMAC)
- Timing-safe comparison (prevents timing attacks)
- Replay attack prevention (timestamp window check)
- Provider auto-detection from request headers
- TypeScript discriminated union for typed webhook payloads

**Key edge cases AI gets wrong:** Using `===` instead of `timingSafeEqual`, not reading raw body before JSON parsing, missing the `t=` timestamp component in Stripe's scheme.

---

#### 9. `sentry-setup`
**Score: 4.2/5**

| Dimension | Score | Notes |
|---|---|---|
| Demand | 4 | Sentry is the dominant error tracking choice |
| Pain | 4 | Source maps, Next.js config, user context, custom events all have gotchas |
| Uniqueness | 4 | Official guide is framework-specific and fragmented |
| Scope | 4 | Error tracking + performance + user context |

**What to include:**
- Next.js App Router Sentry setup (client + server + edge)
- Source map upload via `withSentryConfig` without leaking secrets
- User context enrichment (attach user id, email to errors)
- Custom event capture with structured metadata
- Performance tracing for API routes and DB queries
- Error boundary component for React

**Key edge cases AI gets wrong:** Source maps uploaded but not symbolicated (wrong `assetPrefix`), PII leaking through automatic breadcrumbs, not setting `environment` tag (all errors show as `production`).

---

#### 10. `image-upload`
**Score: 4.1/5**

| Dimension | Score | Notes |
|---|---|---|
| Demand | 5 | Image upload is required in most user-facing apps |
| Pain | 4 | Resize, format conversion, size validation, EXIF stripping |
| Uniqueness | 3 | Sharp docs are decent but integration patterns are scattered |
| Scope | 3 | Needs multiple output targets (local, S3, Cloudinary) |

**What to include:**
- Sharp-based pipeline: resize, WebP/AVIF conversion, quality optimization
- EXIF metadata stripping (privacy-critical for user photos)
- File type validation (magic bytes, not just MIME header)
- Multipart upload middleware (Busboy/Multer compatible)
- Presigned upload URL generation for direct browser-to-S3
- Thumbnail generation with aspect ratio preservation

**Key edge cases AI gets wrong:** Trusting `Content-Type` header for file type (easily spoofed), not stripping GPS coordinates from EXIF, Sharp not handling HEIC from iPhones without libvips rebuild.

---

### Tier 2 — High Priority (Build in months 2–3) — COMPLETE

All 10 Tier 2 packages have been implemented and shipped.

---

#### 11. `posthog-analytics`
**Score: 3.9/5**

PostHog is the open-source alternative to Mixpanel/Amplitude, popular with vibe-coders who want self-hosted analytics. Key challenge: autocapture conflicts with custom events, feature flags need server-side evaluation for SSR.

**Include:** Event capture with user identification, feature flag evaluation (client + server-side), session recording opt-in, group analytics for B2B, Next.js middleware integration.

---

#### 12. `neon-postgres`
**Score: 3.9/5**

Neon is the leading serverless PostgreSQL for Vercel/edge deployments. Key challenge: connection pooling in serverless (each request creates a new connection without pooler), cold start latency management.

**Include:** Drizzle ORM setup with Neon HTTP driver, connection pool config for serverless, migration workflow (Drizzle Kit), common query patterns, transaction handling with proper rollback.

---

#### 13. `notion-api`
**Score: 3.8/5**

Notion is widely used as a lightweight CMS and team database. AIs often generate stale Notion API calls (v1 deprecations). Key challenge: the block model is deeply nested and pagination is recursive.

**Include:** Database CRUD (query, create, update), page creation with blocks, recursive block fetching with pagination, rich text serialization/deserialization, file and image block handling.

---

#### 14. `jwt-auth`
**Score: 3.8/5**

JWT is used in every custom auth system. AIs often generate insecure patterns (no expiry, wrong algorithm, missing audience claim). This package gives a production-secure baseline.

**Include:** Access + refresh token pair generation, token verification with algorithm pinning, refresh token rotation with family tracking (prevent replay), blacklist with Redis backend, HTTP-only cookie helpers.

---

#### 15. `telegram-bot`
**Score: 3.7/5**

Telegram bots are popular for notification systems and internal tooling in the vibecoding community. The Webhooks API is tricky to set up correctly with SSL/ngrok.

**Include:** Webhook setup and verification, send text/markdown/HTML messages, inline keyboards, file/photo sending, command routing, group chat handling.

---

#### 16. `react-email-templates`
**Score: 3.7/5**

React Email lets developers write email templates in React, solving the HTML-email-in-2024 problem. The challenge is the set of cross-client compatible components.

**Include:** Welcome email, password reset, payment receipt, team invitation, notification digest. Each as a ready-to-copy React Email component with Resend/Postmark/SendGrid adapter.

---

#### 17. `vercel-og`
**Score: 3.6/5**

Open Graph social preview images are required for any content that gets shared. `@vercel/og` works at the edge but font loading and dynamic data patterns are unintuitive.

**Include:** Route handler setup, custom font loading, dynamic text/image composition, screenshot-style card templates (blog post, product, profile), caching headers.

---

#### 18. `algolia-search`
**Score: 3.6/5**

Algolia is the most-used hosted search for content-heavy apps. Index management and faceted search setup trip up AI significantly.

**Include:** Index creation and settings (searchable attributes, facets, ranking), record sync pipeline (full + incremental), React InstantSearch components (SearchBox, Hits, RefinementList), query suggestions.

---

#### 19. `cron-scheduler`
**Score: 3.5/5**

Cron jobs in serverless environments require a different mental model. This package gives production patterns for the 3 main approaches vibe-coders reach for.

**Include:** Vercel Cron configuration and route handler pattern, Inngest function definition with retry/concurrency, QStash (Upstash) for durable job scheduling, cron expression validator, idempotency key pattern for safe retries.

---

#### 20. `lemonsqueezy-payments`
**Score: 3.5/5**

LemonSqueezy is gaining traction as a Stripe alternative — it handles merchant of record (EU VAT, global tax compliance) automatically. Popular with solo devs shipping B2C SaaS.

**Include:** Checkout URL generation, webhook validation + event routing, subscription status sync, customer portal redirect, billing portal for plan changes, proration handling.

---

### Tier 3 — Medium Priority (Build in months 4–6) — COMPLETE

All 10 Tier 3 packages have been implemented and shipped.

---

#### 21. `openai-assistants`
**Score: 3.4/5**

OpenAI Assistants API enables stateful, multi-turn AI agents with file access. The thread + run lifecycle is complex and poorly understood.

**Include:** Assistant creation with file search + code interpreter, thread and message management, run polling with streaming, file upload for retrieval, token usage tracking.

---

#### 22. `cloudflare-kv`
**Score: 3.4/5**

Cloudflare KV, D1, and Durable Objects are popular for edge-native apps. Worker binding patterns don't translate from typical Node.js knowledge.

**Include:** KV namespace CRUD with TTL, D1 SQL queries via Wrangler bindings, cache control patterns, R2 integration within Workers context (distinct from our general s3-storage), Durable Object basics for stateful edge.

---

#### 23. `expo-push`
**Score: 3.3/5**

React Native apps on Expo need push notifications. The Expo Notifications service requires both server-side token management and client-side permission handling.

**Include:** Push token registration and storage, send notification via Expo Push API, delivery receipt checking, iOS and Android payload differences, deep link handling from notification tap.

---

#### 24. `linear-api`
**Score: 3.3/5**

Linear is widely used in vibe-coding teams for task management. The GraphQL API is powerful but intimidating for devs used to REST.

**Include:** Issue creation and update (status, assignee, priority), webhook ingestion with signature verification, project and team queries, comment creation, label management, search.

---

#### 25. `mapbox-maps`
**Score: 3.2/5**

Mapbox GL JS is the leading interactive map library. Integration with React and dynamic data sources is non-trivial.

**Include:** Map initialization with Mapbox GL React wrapper, custom markers with popup, geocoding (address → coordinates), directions API, GeoJSON data source for choropleth/heatmap, location search input.

---

#### 26. `cloudflare-workers-ai`
**Score: 3.2/5**

Cloudflare Workers AI provides on-edge inference for LLaMA, Whisper, and image generation. Popular for zero-latency AI features in CF deployments.

**Include:** Text generation (LLaMA 3), speech-to-text (Whisper), image generation (Stable Diffusion), text embeddings, model selector abstraction, streaming response handling.

---

#### 27. `qr-code-generator`
**Score: 3.1/5**

QR codes are needed for payment flows, app linking, WiFi sharing, and vCard generation. AI typically generates the basic case but misses SVG output, custom branding, and error correction level.

**Include:** URL QR code, WiFi credentials QR, vCard QR, payment QR (SEPA, PIX, CashApp), PNG + SVG output, custom color/logo overlay, error correction level selection.

---

#### 28. `csv-export`
**Score: 3.1/5**

CSV/Excel export is needed in virtually every data-heavy B2B app. The challenge is streaming large datasets without memory overflow.

**Include:** Streaming CSV generation (Node.js Transform stream), XLSX export with formatting (ExcelJS), chunked database query pattern, progress events, field mapping + header customization, CSV import with validation.

---

#### 29. `github-actions-notify`
**Score: 3.0/5**

Dev teams want to pipe GitHub Actions events into Slack, email, or their own webhook. This package provides the GitHub side of that integration.

**Include:** Workflow run status webhook parsing, deployment event handling, PR review and check status events, formatted notification payloads (for Slack, email, etc.), GitHub Actions environment variable helpers.

---

#### 30. `plausible-analytics`
**Score: 3.0/5**

Plausible is the privacy-first Google Analytics alternative. Popular with indie hackers and teams subject to GDPR where GA is legally questionable.

**Include:** Script embed helper (CSP-compatible), server-side event tracking API, custom event + goal setup, Next.js App Router pageview tracking, self-hosted vs. cloud config, revenue tracking for ecommerce.

---

## Summary Matrix

| # | Package | Tier | Primary Persona | Effort |
|---|---|---|---|---|
| 1 | `supabase-client` | 1 | Full-stack SaaS dev | L |
| 2 | `openai-streaming` | 1 | AI app builder | M |
| 3 | `anthropic-claude` | 1 | AI app builder | M |
| 4 | `google-oauth` | 1 | Any web app | M |
| 5 | `nextauth-setup` | 1 | Next.js dev | M |
| 6 | `twilio-sms` | 1 | Consumer app | M |
| 7 | `upstash-redis` | 1 | Serverless dev | S |
| 8 | `webhook-validator` | 1 | Any backend dev | S |
| 9 | `sentry-setup` | 1 | Any web app | M |
| 10 | `image-upload` | 1 | User-facing app | M |
| 11 | `posthog-analytics` | 2 | Product-focused dev | S |
| 12 | `neon-postgres` | 2 | Serverless dev | M |
| 13 | `notion-api` | 2 | Content app / internal tool | M |
| 14 | `jwt-auth` | 2 | Custom auth system | S |
| 15 | `telegram-bot` | 2 | Bot / notification system | M |
| 16 | `react-email-templates` | 2 | Any SaaS | S |
| 17 | `vercel-og` | 2 | Content / marketing app | S |
| 18 | `algolia-search` | 2 | Content-heavy app | M |
| 19 | `cron-scheduler` | 2 | Any backend | M |
| 20 | `lemonsqueezy-payments` | 2 | Solo SaaS dev | M |
| 21 | `openai-assistants` | 3 | AI agent builder | L |
| 22 | `cloudflare-kv` | 3 | CF Workers dev | M |
| 23 | `expo-push` | 3 | Mobile (RN) dev | M |
| 24 | `linear-api` | 3 | Dev tool builder | S |
| 25 | `mapbox-maps` | 3 | Geo / mapping app | M |
| 26 | `cloudflare-workers-ai` | 3 | Edge AI dev | M |
| 27 | `qr-code-generator` | 3 | Any app | S |
| 28 | `csv-export` | 3 | B2B / data app | S |
| 29 | `github-actions-notify` | 3 | Dev tooling | S |
| 30 | `plausible-analytics` | 3 | Privacy-conscious dev | S |

*Effort: S = Small (1–2 days), M = Medium (3–5 days), L = Large (1 week+)*

---

## Recommendations for Execution

1. **Start with `webhook-validator`** — highest uniqueness score, smallest effort, unlocks confidence in the whole Beepack value prop. No equivalent exists in the ecosystem.
2. **Ship Tier 1 AI packages first** (`openai-streaming`, `anthropic-claude`) — aligns with OpenClaw integration and directly targets our MCP-connected users.
3. **Bundle opportunity:** `supabase-client` + `nextauth-setup` + `neon-postgres` + `react-email-templates` = "SaaS starter bundle". Consider releasing these together as a named bundle.
4. **`siret-utils` tells us there's a localization market** — after the core 30, evaluate locale-specific packages (UK Companies House, German USt-IdNr, etc.).

---

## Next Steps

- [x] CEO / board review of this prioritization
- [x] Assign package authors (internal build vs. community submissions)
- [x] Create BEE tickets for each Tier 1 package
- [x] All 30 packages implemented and shipped (Tier 1, 2, and 3 complete)
- [ ] Define acceptance criteria and test requirements per package
- [ ] Consider a "wanted packages" page on beepack.ai for community demand signal
