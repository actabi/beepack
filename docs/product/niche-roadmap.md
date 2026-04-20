# Beepack - Niche Package Roadmap (Post-Validation)

> **Created:** 2026-04-20 (updated same day to international-narrow positioning)
> **Status:** Gated - DO NOT build until validation-plan.md success criteria are met (deadline 2026-05-20)
> **Owner:** gdelaroque@erama.co

---

## Gate

This roadmap lists the **next packages to build**, but only if 5-user validation succeeds. See [validation-plan.md](./validation-plan.md). Building any of these before validation unlocks re-creates the 100+-packages-zero-users problem we just escaped.

---

## Selection criteria (every package must meet all 4)

1. **LLM-fail check:** Frontier LLMs (Claude Opus 4.7, GPT-5, Gemini 2.5 Pro as of April 2026) reliably hallucinate this API - invented endpoints, wrong auth scheme, outdated schema, or confident but wrong docs. Verify with 3 fresh zero-shot prompts before building.
2. **Training data scarcity:** API had a major schema change within the last 12 months, uses domain heuristics not in training, is regulatory/regional, or is undocumented.
3. **Real demand:** At least one validation user has asked for it OR there is credible public pain (blog posts, HN threads, Stack Overflow questions without good answers, GitHub issue tracker noise).
4. **Scoped in 1-3 days:** Solo-maintainer feasibility. If it's a week of work, break it down or skip it.

If any criterion fails, the package is out.

---

## Tier 1 - Highest priority (build first if validated)

### 1. `nextjs-15-migration`
**Why:** Next.js 15 (shipped 2024-Q4, App Router-only) is THE biggest breaking change of 2024-2025 in the JS ecosystem. LLMs still routinely mix App Router and Pages patterns, emit `getServerSideProps`-style code alongside `async` Server Components, miss the new `use cache` directive, and hallucinate cookies/headers API usage.

**What to include:** Canonical App Router layouts + pages scaffolding, Server Components vs Client Components patterns, cookies/headers async API usage, `use cache` directive examples, parallel routes + intercepting routes templates, migration helpers for v13/v14→v15.

**Verify before building:** Run "migrate this Next.js 14 Pages Router route to App Router with Server Components" on Claude. If it emits any `getServerSideProps` or synchronous cookies/headers access, proceed.

---

### 2. `authjs-v5-setup` (extension of existing nextauth-setup)
**Why:** Already have this, but can expand into a Tier 1 flagship with more providers + edge cases (v4→v5 migration helpers, credentials provider edge cases, RSC-aware session reading).

**What to add:** Credentials provider with bcrypt, JWT strategy vs database sessions comparison, middleware with role-based access, RSC-safe `auth()` usage, migration script from v4 to v5 configs.

---

### 3. `tailwind-v4-migration`
**Why:** Tailwind v4 (2024-Q4) replaced the JS config with CSS-first config, changed directive syntax, and broke many v3 plugins. LLMs still emit v3 `tailwind.config.js` syntax and `@apply` patterns that break in v4.

**What to include:** v4-native CSS config with `@theme`, migration from `tailwind.config.js`, new `@utility` directive, Lightning CSS config, common plugin replacements, Vite/Next.js v15 integration patterns.

**Verify before building:** Prompt "set up Tailwind for Next.js 15". If output is `tailwind.config.js` with `content:` array, proceed.

---

## Tier 2 - Second wave (after Tier 1 ships and stabilizes)

### 4. `prisma-v6-migration`
Breaking changes in query API, new `@prisma/client` pooling model, `.findUnique` becoming stricter. LLMs emit v5 patterns.

### 5. `expo-sdk-51-upgrade`
Expo SDK 51 introduced New Architecture as default; many v50 push / notifications patterns break silently.

### 6. `svelte-5-runes`
Svelte 5 runes (`$state`, `$derived`, `$effect`) replace the v4 reactivity model. LLMs still emit `$:` reactive declarations.

### 7. `react-router-v7-migration`
React Router v7 / Remix convergence. Breaking changes in loaders/actions, new data APIs.

### 8. `eu-business-ids` (expansion of siret-utils)
Adds UK Companies House, DE Handelsregister, NL KvK, ES CIF, IT Codice Fiscale validation. All regulatory, all have LLM-hallucinated Luhn/check-digit algorithms.

---

## Tier 3 - Opportunistic (only if validation users explicitly ask)

### 9. `shopify-metafields`
Metafields API has multiple versions + quirks (namespace conventions, key validation). LLMs mix REST/GraphQL.

### 10. `notion-api-pagination`
Notion v1 pagination is recursive and confusing. LLMs often write infinite-loop-prone code.

### 11. `psd2-open-banking`
EU-wide open banking flows. Strong Customer Authentication quirks. Region-agnostic.

### 12. `wcag-2-2-accessibility`
WCAG 2.2 new success criteria (2.4.11 Focus Not Obscured, 2.5.7 Dragging Movements, etc.). LLMs miss these.

### 13. `gdpr-compliance-helpers`
DSR (Data Subject Request) handling patterns, data export/erasure scaffolds. Region-agnostic (any GDPR-exposed service).

### 14. `franceconnect-oauth` (kept as niche regulatory)
French government SSO. Moved from Tier 1 to Tier 3 - too regional, wait for explicit ask from validation users.

---

## Packages explicitly NOT on the roadmap

If someone asks for any of these, say no (politely) and explain why:

- **Stripe, OpenAI, Anthropic, GitHub, Google OAuth** - Claude/GPT do these well. We don't duplicate commodity integrations.
- **generic JWT, webhook validators, rate limiters** - commodity security patterns LLMs handle.
- **npm package wrappers for popular SDKs** (supabase, neon, etc.) - npm `install` exists. No value in our vendoring for maintained SDKs.
- **Any UI component / React / shadcn-style** - out of scope. shadcn/ui won that market.
- **Any stable SaaS integration** that had no breaking change in the last 18 months.

---

## Anti-patterns to avoid

- **Tier inflation:** "We have 3 Tier-1 packages, so let's commit to 10 more" - no. Ship Tier 1. Measure demand. Then decide.
- **Framework expansion:** "Auth.js v5 works, let's add Lucia, Clerk, Supabase Auth..." - no. Each new auth provider dilutes the "breaking change zone" thesis.
- **Regional creep (inverse):** "Let's add every regional business registry we can find" - no. EU business IDs is one package, not 27. We pick what has explicit user pull.
- **Ecosystem features:** "Let's add a /suggestions page, a leaderboard, a badge system" - only if a validation user explicitly asks. Solo maintainer can't build ecosystem features for zero users.

---

## Execution rhythm (if validation passes)

1 package every 2 weeks, not faster. Rhythm:
- Week 1: LLM-fail verification + API exploration + skeleton impl
- Week 2: edge cases, tests, README, security scan, publish
- Week 3: outreach to the validation user who asked for it
- Week 4: start next package

**Review gate every 2 packages:** are users pulling and using them? If not, stop building and re-validate.

---

## Why no stable SaaS integrations (Mixpanel, Segment, Stripe, etc.)?

LLMs do these fine. The niche is specifically where they fail - which means **APIs that changed recently** (last 12-18 months) or **APIs with domain heuristics that aren't in training**.

Every package's lifecycle: built because LLMs hallucinate it today, retired from the catalog when LLMs catch up (typically 6-18 months after we ship).

---

## Retirement criteria

A package is retired from the catalog when:
- Frontier LLMs consistently zero-shot the API correctly on 3+ test prompts
- The underlying SDK has been stable for 12+ months
- There's no active user pull (downloads, feedback, suggestions)

Retirement isn't failure - it's the signal that training data caught up. The roadmap is a living document.
