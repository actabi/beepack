# Beepack - Niche Package Roadmap (Post-Validation)

> **Created:** 2026-04-20
> **Status:** Gated - DO NOT build until validation-plan.md success criteria are met (deadline 2026-05-20)
> **Owner:** gdelaroque@erama.co

---

## Gate

This roadmap lists the **next packages to build**, but only if 5-user validation succeeds. See [validation-plan.md](./validation-plan.md). Building any of these before validation unlocks re-creates the 43-packages-zero-users problem we just escaped.

---

## Selection criteria (every package must meet all 4)

1. **LLM-fail check:** Frontier LLMs (Claude Opus 4.7, GPT-5, Gemini 2.5 Pro as of April 2026) reliably hallucinate this API - invented endpoints, wrong auth scheme, outdated schema, or confident but wrong docs. Verify with 3 fresh zero-shot prompts before building.
2. **Training data scarcity:** API is regional (French), regulatory, undocumented, or had a major schema change within the last 12 months.
3. **Real demand:** At least one validation user has asked for it OR there is credible public pain (blog posts, HN threads, Stack Overflow questions without good answers).
4. **Scoped in 1-3 days:** Solo-maintainer feasibility. If it's a week of work, break it down or skip it.

If any criterion fails, the package is out.

---

## Tier 1 - Highest priority (build first if validated)

### 1. `urssaf-api`
**Why:** URSSAF is the French social security collector. Critical for any French SaaS dealing with freelancers, employees, or auto-entrepreneurs. LLMs confidently invent endpoints and confuse the several distinct URSSAF APIs (DSN, CESU, CFE, auto-entrepreneur).

**What to include:** Contribution status query, DSN submission helpers, auto-entrepreneur quarterly declaration scaffolding, rate-limit awareness, typical error codes and retry patterns.

**Verify before building:** Test prompt "Write a Node.js client to submit a DSN declaration to URSSAF" in Claude/GPT. If output is broken, proceed.

---

### 2. `pappers-api`
**Why:** Pappers.fr is the most-used programmatic access to French company data (complements INSEE). Official docs are decent but change frequently. LLMs often confuse Pappers with Societe.com or Infogreffe.

**What to include:** Company lookup by SIREN/SIRET, officers and ownership structure, publications (BODACC), financial statements retrieval, rate-limit and pagination patterns.

**Verify before building:** Test "Fetch a French company's officers from Pappers API". If endpoints are wrong or the auth scheme is invented, proceed.

---

### 3. `franceconnect-oauth`
**Why:** FranceConnect is the official French government SSO. Required for any public-sector-adjacent app. Has specific OIDC quirks (eidas levels, specific scopes, particular claim mapping) that generic OAuth examples don't cover.

**What to include:** OIDC flow with FranceConnect+ (eIDAS substantial level), claim mapping (given_name, family_name, birthdate, birthplace), session validation, logout with id_token_hint, sandbox vs production config.

**Verify before building:** Test "Set up FranceConnect OAuth for a Next.js app". If Claude emits generic OAuth code without FC-specific claims, proceed.

---

## Tier 2 - Second wave (after Tier 1 ships and stabilizes)

### 4. `chorus-pro-api`
**Why:** Mandatory for French B2G invoicing. Schema is complex (PEPPOL + FR-specific extensions), auth flow is non-trivial, docs are PDF-heavy.

**What to include:** Invoice submission via FacturX/PEPPOL, status polling, attachment handling, structured error parsing, sandbox environment.

### 5. `dsn-helper`
**Why:** DSN (Declaration Sociale Nominative) is the monthly French payroll declaration. Schema is vast; format-specific serializers save real time.

**What to include:** DSN message construction (block structure), validation against the DSN XSD, submission to net-entreprises.fr, status retrieval.

### 6. `yousign-api`
**Why:** YouSign is a leading French e-signature provider (alongside DocuSign EU). API churned recently; LLM examples are often stale.

**What to include:** Document creation, signer assignment, workflow orchestration, webhook signature verification, template management.

### 7. `qonto-api`
**Why:** Qonto is the default French neobank for SMBs. Open Banking API is specific to French PSD2 implementation.

**What to include:** Account balance, transactions listing, beneficiary management, transfer creation, webhook handling.

---

## Tier 3 - Opportunistic (only if validation users explicitly ask)

### 8. `pennylane-api`
French accounting/payroll SaaS. Ask signal needed before building.

### 9. `insee-sirene-api`
The new (2025+) INSEE SIRENE API via portail-api.insee.fr. LLMs still emit old v1 endpoints. Ask signal needed.

### 10. `bodacc-search`
Official legal notices search. Narrow but valuable for due-diligence flows.

---

## Packages explicitly NOT on the roadmap

If someone asks for any of these, say no (politely) and explain why:

- **Stripe, OpenAI, Anthropic, GitHub, Google OAuth** - Claude/GPT do these well. We don't duplicate commodity integrations.
- **generic JWT, webhook validators, rate limiters** - commodity security patterns LLMs handle.
- **npm package wrappers for popular SDKs** (supabase, neon, etc.) - npm `install` exists. No value in our vendoring for maintained SDKs.
- **Any UI component / React / shadcn-style** - out of scope. shadcn/ui won that market.
- **Any Anglo-world SaaS integration** unless it had a major breaking change in the last 12 months.

---

## Anti-patterns to avoid

- **Tier inflation:** "We have 3 Tier-1 packages, so let's commit to 10 more" - no. Ship Tier 1. Measure demand. Then decide.
- **Framework expansion:** "Auth.js v5 works, let's add Lucia, Clerk, Supabase Auth..." - no. Each new auth provider dilutes the "breaking change zone" thesis.
- **English-market creep:** "We built urssaf, let's do UK Companies House and German Handelsregister" - maybe someday. Not until the French core has traction.
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

## Why no SaaS API integrations (Mixpanel, Segment, Linear alt, etc.)?

LLMs do these fine. The niche is specifically where they fail. Adding SaaS SDK wrappers re-creates the 43-packages-generic-lane trap.

Linear is on the current catalog only because the GraphQL schema changed recently. If the churn slows (2-3 quarters stable), linear-api retires from the catalog.
