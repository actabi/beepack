# Beepack - User Story Map: Skill Safety Scanner

> **Created:** 2026-04-20
> **Pivot from:** Package registry (shut down - AI-reproductible packages had no moat)
> **Pivot to:** Skill Safety Scanner - validates Claude Code / Agent Skills before install
> **Owner:** gdelaroque@erama.co (solo founder)
> **Status:** Pre-validation - DO NOT start build before 48h signal test (see Pre-validation section)

---

## Table of contents

1. [Product north star](#1-product-north-star)
2. [Pre-validation gate (48h) - MUST PASS BEFORE BUILD](#2-pre-validation-gate-48h)
3. [Personas](#3-personas)
4. [Story map overview (visual)](#4-story-map-overview)
5. [Backbone - user activities](#5-backbone-user-activities)
6. [Release plan (MVP → V4)](#6-release-plan)
7. [Story details (MVP only, in build order)](#7-story-details-mvp)
8. [V2-V4 story shortlists](#8-v2-v4-story-shortlists)
9. [Non-goals (what we explicitly will NOT do)](#9-non-goals)
10. [Technical architecture (what we reuse from beepack)](#10-technical-architecture)
11. [Success metrics per release](#11-success-metrics)
12. [Risks & mitigations](#12-risks-mitigations)

---

## 1. Product north star

**One-liner:** "Is this AI agent skill safe to install?"

**The problem (concrete):** Agent Skills marketplaces (Anthropic Skills, lobehub, Claudepluginhub, sickn33/antigravity-awesome-skills with 1400+ skills) contain skills that bundle `npx`, `pip install`, shell commands, and URL fetches. [Aikido.dev showed in Dec 2025 that many skills reference packages that don't exist on npm](https://www.aikido.dev/blog/agent-skills-spreading-hallucinated-npx-commands) - a vector for typosquat malware.

**The product:** A scanner (web UI + API + MCP tool + CLI + GitHub Action) that takes a skill (SKILL.md + scripts) as input and returns a safety verdict with actionable explanations.

**Why us:** Beepack already has the security-engine + embeddings + Qdrant + registry API + MCP server. 80% of the infra is built. What's missing is the skill-specific analysis logic + the DB of real APIs/packages/domains to validate against.

**What we're NOT:** a 12th anti-hallucination skill that tells Claude "be careful" (11 of those exist). We're a **validator** that produces verifiable, deterministic output.

---

## 2. Pre-validation gate (48h)

**DO NOT start building** until at least 3 of the following happen. This is a hard gate - no sunk-cost override.

### Validation actions (do these first, in this order)

| # | Action | Target | Success signal |
|---|---|---|---|
| 1 | Comment on [Aikido article](https://www.aikido.dev/blog/agent-skills-spreading-hallucinated-npx-commands) saying "building an open-source skill validator inspired by this - anyone interested in early access?" | Aikido readers | 1+ "yes interested" reply |
| 2 | Post on r/ClaudeAI: "Aikido just showed AI skills can install malicious packages via hallucinated npx. Do you audit skills before installing?" | 200+ views, 5+ upvotes | 3+ comments saying "no, would use a tool" |
| 3 | DM on X/Twitter to [sickn33](https://github.com/sickn33), [a-ariff](https://github.com/a-ariff), [lobehub operator](https://lobehub.com) | 3 DMs sent | 2+ replies, 1+ says "useful for my marketplace" |
| 4 | Post on r/ChatGPTCoding: same question, different phrasing | 100+ views | 2+ comments of genuine interest |

### Success criteria (all must be true)

- **3 of 4 actions yield positive signal within 48h**
- **At least 1 reply offers to be a beta user** (not just "cool idea")
- **At least 1 marketplace operator or big skill author shows interest** (this is the distribution signal)

### Kill criteria

- **Zero or 1 positive replies** after 48h → the demand hypothesis is wrong. Do not build. Reconsider pivot or shutdown beepack.
- **"Cool idea" replies without commitment to try** → treat as zero. Polite dismissal.

### Recording results

Create a new file `docs/product/prevalidation-log.md` with timestamp, reply text, and verdict. Commit daily.

---

## 3. Personas

### Persona A: Carla, the Careful Consumer
- **Role:** Senior full-stack dev at a 30-person startup. Uses Claude Code daily.
- **Context:** Her CTO just forwarded her the Aikido article. She was about to install 3 skills from sickn33's collection for a Linear integration.
- **Pain:** No way to know which of the 3 skills is safe. No time to audit 1400+ lines of SKILL.md manually.
- **What she wants:** Paste a skill URL, get a verdict in 10 seconds. Red/yellow/green with a 1-line explanation per issue.
- **Willing to pay:** Yes, ~$10/mo for unlimited scans + org policy.
- **Primary release:** MVP covers her.

### Persona B: Paul, the Publisher
- **Role:** Open-source maintainer. Ships 5 Claude Code skills on his GitHub.
- **Context:** Wants to signal to users his skills are safe to install.
- **Pain:** Users install blindly or not at all. No signal of quality. His skills have ~20 stars but no adoption.
- **What he wants:** A "beepack verified" badge on his repo. Automatic scan on every commit. Public score page.
- **Willing to pay:** No, wants it free with badge. (Free tier justifies itself: his badge is our marketing.)
- **Primary release:** V2 covers him (badge + GitHub Action).

### Persona C: Maya, the Marketplace operator
- **Role:** Maintains sickn33/antigravity-awesome-skills (1400+ skills).
- **Context:** The Aikido article blamed her ecosystem. She's worried about reputation.
- **Pain:** Manually reviewing 1400 skills is impossible. Needs automated safety rating.
- **What she wants:** API to bulk-scan all skills in her repo. Display rating on each skill page. Alert when a skill changes and becomes unsafe.
- **Willing to pay:** Yes, $100-500/mo for bulk API + dashboard.
- **Primary release:** V3-V4 covers her.

### Persona D: Enterprise Eve
- **Role:** Security engineer at a 200-person company.
- **Context:** Devs installing random skills in their Claude Code without review = compliance risk.
- **Pain:** No org-wide policy enforcement. No audit trail. No way to ban specific unsafe skills.
- **What she wants:** Admin dashboard showing all skills her org has installed, with per-skill risk scores. Ability to block skills company-wide. SSO. Compliance export.
- **Willing to pay:** Yes, $500-2000/mo enterprise tier.
- **Primary release:** V4 covers her.

---

## 4. Story map overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ACTIVITIES (backbone - what users do in sequence)                                   │
├───────────┬───────────┬───────────┬───────────┬───────────┬───────────┬─────────────┤
│ DISCOVER  │ EVALUATE  │ INSTALL   │ PUBLISH   │ MONITOR   │ RESPOND   │ GOVERN      │
│ a skill   │ its safety│ safely    │ own skill │ ecosystem │ to issues │ at org scale│
├───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼─────────────┤
│ TASKS                                                                                │
│ Browse    │ Paste URL │ See OK    │ Scan my   │ Alert on  │ View CVE  │ Dashboard   │
│ market    │ Upload .md│ before    │ skill     │ changes   │ advisory  │ of all used │
│ Search    │ Drop repo │ install   │ Get badge │ Weekly    │ Get patch │ Block skill │
│ Recommend │ See score │ Block bad │ Fix issues│ report    │ Notify    │ Audit log   │
│ Compare   │ Deep dive │           │ Auto PR   │ RSS feed  │ team      │ SSO + SAML  │
├───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼─────────────┤
│ RELEASES (top-to-bottom = earliest to latest)                                        │
│                                                                                      │
│ MVP       │ MVP       │ MVP       │           │           │           │             │
│           │ (paste +  │ (simple   │           │           │           │             │
│           │  scan +   │  warn in  │           │           │           │             │
│           │  report)  │  CLI)     │           │           │           │             │
├───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼─────────────┤
│ V2        │ V2        │ V2        │ V2        │           │           │             │
│           │ (MCP tool │ (MCP tool │ (badge +  │           │           │             │
│           │  + CLI)   │  + block) │  GH act)  │           │           │             │
├───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼─────────────┤
│ V3        │ V3        │ V3        │ V3        │ V3        │ V3        │             │
│           │ (batch)   │           │ (auto-fix)│ (watch +  │ (CVE-like │             │
│           │           │           │           │  alerts)  │  feed)    │             │
├───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼─────────────┤
│ V4        │           │           │           │ V4        │ V4        │ V4          │
│           │           │           │           │ (report)  │ (webhook) │ (org dash + │
│           │           │           │           │           │           │  SSO + audit)│
└───────────┴───────────┴───────────┴───────────┴───────────┴───────────┴─────────────┘
```

---

## 5. Backbone - user activities

Each activity is a step a user takes in sequence. They map to distinct moments in their workflow.

| # | Activity | User verb | Outcome for user | Primary persona |
|---|---|---|---|---|
| 1 | **Discover** | "I need a skill that does X" | Candidate skills identified | All |
| 2 | **Evaluate** | "Is skill Y safe to install?" | Verdict + rationale | Carla, Eve |
| 3 | **Install** | "I'm installing skill Y now" | Install blocked if unsafe, proceed if safe | Carla, Paul's users |
| 4 | **Publish** | "I want to publish my skill" | Verified, badged, trusted | Paul |
| 5 | **Monitor** | "What's happening in my skill ecosystem?" | Continuous safety signal | Maya, Eve |
| 6 | **Respond** | "A skill I rely on became unsafe" | Notified, remediated | All |
| 7 | **Govern** | "Enforce safety policy across my org" | Dashboard, blocks, audit trail | Eve |

---

## 6. Release plan

### MVP (Week 1-2) - "Paste and scan"
**Goal:** Prove people will paste skill URLs and get value in 10 seconds.
**Scope:** Activities 2, 3 only (Evaluate, Install-warn).
**Distribution:** Single landing page `beepack.ai/scan` + CLI `beepack scan <url>`.
**Success:** 200 scans in the first week, 30%+ return rate.

### V2 (Week 3-4) - "In your workflow"
**Goal:** Make it reach users at the moment they need it (not a separate site).
**Scope:** Activity 4 (Publish) + deeper Activity 2 (MCP tool, GitHub Action).
**Distribution:** MCP tool callable from Claude Code. Publisher badge. GitHub Action.
**Success:** 100+ repos using GitHub Action. 5+ publishers displaying badge.

### V3 (Week 5-7) - "Always watching"
**Goal:** Move from point-in-time scan to continuous monitoring.
**Scope:** Activities 5, 6 (Monitor, Respond).
**Distribution:** Watch mode + email/webhook alerts. Public CVE-like feed for unsafe skills.
**Success:** 20+ marketplaces or orgs using watch mode. 1+ real security incident caught publicly.

### V4 (Week 8-12) - "Enterprise"
**Goal:** Monetize via org dashboards.
**Scope:** Activity 7 (Govern). SSO, audit, policy enforcement.
**Distribution:** Sales-assisted. Pricing: $500-2000/mo.
**Success:** 3 paying enterprise customers. $2k+ MRR.

**Shutdown gate at each release:** if success metric <50% hit, STOP and reconsider.

---

## 7. Story details (MVP)

Stories are in **build order**. Each has acceptance criteria, estimate, and dependencies.

### Story M-1: Static skill analyzer - detect all external commands
**As** Carla, **I want** the scanner to extract every `npx`, `pip install`, `bash` command, `curl URL`, and `import` from a skill, **so that** I know what this skill touches before running it.

**Acceptance criteria:**
- Given a SKILL.md file path, return a JSON list of:
  - Shell commands (with full arg list)
  - URLs fetched
  - npm packages installed
  - pip packages installed
  - Files read/written
- Must handle markdown code blocks (``` blocks) and inline backticks
- Must also parse referenced scripts (`.sh`, `.py`, `.js` inside the skill folder)
- Must output in < 2 seconds for a typical skill (< 50KB)

**Technical notes:**
- Parse markdown → AST (use `marked` or regex for MVP)
- Extract code blocks by language tag
- Build a deterministic extractor (not LLM-based - needs reproducibility)

**Estimate:** 1 day
**Depends on:** nothing
**Owner:** backend

---

### Story M-2: npm package existence validator
**As** Carla, **I want** the scanner to verify every npm package referenced in a skill exists on npm, **so that** I catch typosquats or hallucinated packages.

**Acceptance criteria:**
- Given a list of npm package names, hit npm registry `https://registry.npmjs.org/<pkg>`:
  - Return 200 → exists, record last publish date, maintainer, download count
  - Return 404 → does not exist (RED FLAG)
- Cache results for 24h (npm query has rate limits)
- Handle scoped packages (`@scope/name`)
- Handle versioned references (`pkg@1.2.3`) by stripping version

**Technical notes:**
- Use existing storage.js or SQLite cache
- Batch requests (aiohttp or similar)

**Estimate:** 0.5 day
**Depends on:** M-1

---

### Story M-3: Typosquat detector
**As** Carla, **I want** to be warned when a package name looks suspiciously like a popular one (e.g., `stripe-js` vs `stripe`), **so that** I don't install a malicious copycat.

**Acceptance criteria:**
- Maintain a list of top 10,000 npm packages (downloaded weekly, stored locally)
- For each package in a skill, compute Levenshtein distance to top 10k
- If distance <= 2 AND package is NOT in top 10k itself → WARN: possible typosquat of `X`
- Same for pypi (top 1k Python packages)

**Technical notes:**
- Download top packages list from [npmjs.org/top](https://npms.io/) or similar
- Store in SQLite, rebuild weekly
- Use python-Levenshtein or pure JS implementation

**Estimate:** 1 day
**Depends on:** M-2

---

### Story M-4: URL / domain risk rating
**As** Carla, **I want** URLs referenced in a skill to be checked against known-bad domains and recently-registered domains, **so that** I catch data exfiltration attempts.

**Acceptance criteria:**
- Parse every URL from the skill (including in code)
- For each URL:
  - Check against a public blocklist (e.g., EasyList, stopforumspam, or URLhaus)
  - Check domain age via WHOIS (< 30 days old = WARN)
  - Check if domain is a known pastebin/tunnel (ngrok, bore, localtunnel, etc.) = WARN
- Whitelist: npmjs.org, pypi.org, github.com, raw.githubusercontent.com, anthropic.com

**Technical notes:**
- WHOIS via `python-whois` or a free API
- Blocklist: download URLhaus CSV daily

**Estimate:** 1 day
**Depends on:** M-1

---

### Story M-5: Verdict aggregator
**As** Carla, **I want** a single RED / YELLOW / GREEN verdict with a readable rationale, **so that** I can decide in 5 seconds whether to install.

**Acceptance criteria:**
- Aggregate findings from M-2, M-3, M-4
- Verdict rules:
  - **RED (block):** any package returns 404, OR typosquat confidence > 0.9, OR URL matches URLhaus
  - **YELLOW (warn):** possible typosquat, domain < 30 days old, unverified pastebin usage, no deps at all
  - **GREEN (safe):** everything known-good and popular
- Output JSON:
  ```json
  {
    "verdict": "yellow",
    "summary": "1 warning: possible typosquat of 'stripe'",
    "findings": [
      {"severity": "warn", "type": "typosquat", "package": "stripe-js", "likely_target": "stripe", "line": 42}
    ],
    "scanned_at": "2026-04-20T12:34:56Z",
    "scan_id": "..."
  }
  ```
- Persist scan result in SQLite for retrieval

**Estimate:** 0.5 day
**Depends on:** M-2, M-3, M-4

---

### Story M-6: Web UI - paste URL and scan
**As** Carla, **I want** to paste a GitHub URL or upload a SKILL.md and see the verdict, **so that** I don't need a CLI.

**Acceptance criteria:**
- Page at `beepack.ai/scan`:
  - Input: paste URL (GitHub raw, GitHub repo, gist) OR drop a file
  - Button: "Scan"
  - Loading state during scan (<10s)
  - Result card with verdict color, summary, expandable findings list
  - Shareable scan URL (`beepack.ai/scan/<id>`)
- No auth required for MVP
- Mobile-responsive

**Technical notes:**
- Reuse existing `/site` static files + API
- Calls `POST /api/v1/scan` with URL or file upload
- Use existing design system (cards, buttons)

**Estimate:** 1 day
**Depends on:** M-5

---

### Story M-7: CLI - `beepack scan <url>`
**As** Carla, **I want** to scan a skill from my terminal, **so that** I can put it in a pre-install hook.

**Acceptance criteria:**
- Command: `beepack scan <url-or-path>`
- Output: colored terminal verdict (RED/YELLOW/GREEN) + finding list
- Exit code: 0 for GREEN, 1 for YELLOW, 2 for RED
- Flag: `--json` outputs machine-readable format
- Flag: `--strict` treats YELLOW as failure

**Estimate:** 0.5 day
**Depends on:** M-5, existing CLI infra in `/cli`

---

### Story M-8: Analytics - minimal scan tracking
**As** gdelaroque, **I want** to see how many scans happen per day and what users scan, **so that** I can measure the validation signal.

**Acceptance criteria:**
- Log each scan: timestamp, hashed IP (salted), skill URL, verdict
- Daily report emailed at 8am UTC to gdelaroque@erama.co:
  - Total scans
  - Unique visitors (by hashed IP)
  - Top 10 scanned skills
  - Verdict distribution
- No third-party analytics (keep "open source first" rule)

**Estimate:** 0.5 day
**Depends on:** M-5

---

### Story M-9: Landing page copy + launch
**As** gdelaroque, **I want** a landing page that converts Aikido readers and r/ClaudeAI visitors into scan users, **so that** I can distribute.

**Acceptance criteria:**
- Page at `beepack.ai/` rewritten with the Safety Scanner pitch
- Hook: "Is this Claude Code skill safe to install?"
- 3-step animation: paste URL → scan → get verdict
- Live demo with a pre-loaded sketchy skill (shows RED verdict)
- "Add to Claude Code via MCP" CTA (V2 placeholder for now)
- SEO: keywords "claude skill security", "agent skill scanner", "anti-hallucination", "ai supply chain attack"

**Estimate:** 1 day
**Depends on:** M-6

---

### Story M-10: HN + Reddit + X launch
**As** gdelaroque, **I want** to submit to relevant channels with strong hooks, **so that** I get first users.

**Acceptance criteria:**
- HN "Show HN: Open-source scanner for hallucinated Claude Code skills"
  - Submit Tuesday-Thursday, 9am PT
- r/ClaudeAI post with title "I built a scanner for the Aikido skill-security issue"
- r/ChatGPTCoding post with different title
- X thread with 30s video demo showing before/after
- DMs to Aikido team ("we built what your article predicted")

**Estimate:** 0.5 day (execution only - after all tech done)
**Depends on:** M-9 shipped + validation signal from pre-validation gate

---

### MVP total estimate: ~7-8 person-days

Realistically for a solo dev with AI: **2 weeks**. Week 1 = M-1 to M-5 (backend). Week 2 = M-6 to M-10 (UX + launch).

---

## 8. V2-V4 story shortlists

### V2 (Week 3-4)

- **V2-1:** MCP tool - Claude Code can call `scan_skill(url)` directly mid-conversation
- **V2-2:** GitHub Action - repo maintainer adds `beepack-scan.yml`, every push scans the skill, status check appears on PRs
- **V2-3:** Publisher badge - `![safety](https://beepack.ai/badge/...)` SVG that live-updates
- **V2-4:** Publisher dashboard - Paul logs in with GitHub, sees all his skills, their scores, history
- **V2-5:** CLI integration with `npm install -g @actabi/beepack` (already done infra)
- **V2-6:** Rate limiting + basic auth for API
- **V2-7:** Deep-dive report - click a finding to see the exact line/context

### V3 (Week 5-7)

- **V3-1:** Watch mode - register a skill, get alerts when it changes
- **V3-2:** CVE-like feed - public RSS/JSON of newly-flagged unsafe skills
- **V3-3:** Batch scan API - `POST /scan/batch` with list of URLs
- **V3-4:** Auto-fix PRs - for Paul's skills, auto-open a PR fixing typosquat (bump to correct package name)
- **V3-5:** Marketplace integration - contact sickn33, lobehub, claudepluginhub for "display beepack score"
- **V3-6:** Skill safety score 0-100 (granular, not just R/Y/G)

### V4 (Week 8-12)

- **V4-1:** Org dashboard - Eve sees all skills across her team, blocks some, audits
- **V4-2:** SSO (SAML, OIDC)
- **V4-3:** Org-wide policy rules (custom thresholds)
- **V4-4:** Audit log export (SOC 2 / ISO 27001 material)
- **V4-5:** Webhook integrations (Slack, Linear, Jira on alerts)
- **V4-6:** Pricing tiers + Stripe checkout

---

## 9. Non-goals

What we will NOT do, even if asked:

- **We do NOT scan arbitrary code**, only skills (SKILL.md + supporting scripts). Code scanning is Snyk/Socket.dev's market.
- **We do NOT do LLM-based code review**. Our value is deterministic validation against real data. LLMs for review = CodeRabbit. Not us.
- **We do NOT replace Anthropic Skills or compete with them**. We make Skills safer. Distribution model: we align with the standard, not against it.
- **We do NOT ship anti-hallucination prompt libraries** (11 exist). We ship validators.
- **We do NOT build a marketplace** (Anthropic, lobehub, sickn33 cover this). We build a scanner.
- **We do NOT build a registry of "approved" skills**. Our output is a verdict, not an approval. Users decide.
- **We do NOT do Python-specific, Node-specific, or any language-specific deep analysis**. MVP treats all languages the same (parse commands + packages + URLs). Language-specific goes in V3+.

---

## 10. Technical architecture

### Reused from beepack (80% already built)

| Component | Current role | New role |
|---|---|---|
| `security-engine.js` | Scan published packages | Scan submitted skills |
| `embeddings.js` + Qdrant | Semantic package search | Typosquat detection (embedding distance) |
| `storage.js` | Store package files | Store scanned skills + history |
| `server.js` API | Serve package registry | Serve scan API |
| `mcp-remote.js` | Expose MCP tools for packages | Expose `scan_skill` MCP tool |
| `cli/bin/beepack.js` | `beepack pull/publish` | Add `beepack scan` |
| `auth.js` GitHub OAuth | Login for publishers | Login for badges (V2) |
| `site/` | Package registry pages | Scan UI + landing |
| SQLite DB | Packages, versions, scans | Scan results, history, subscriptions |

### New to build

| Component | Purpose |
|---|---|
| `skill-parser.js` | Parse SKILL.md → extract commands/URLs/packages |
| `validators/npm.js` | Call npm registry, cache |
| `validators/pypi.js` | Call pypi, cache |
| `validators/urls.js` | URLhaus + WHOIS + pastebin detection |
| `validators/typosquat.js` | Levenshtein + top-package list |
| `verdict-aggregator.js` | R/Y/G scoring logic |
| `site/scan.html` | UI page |
| `cli/src/commands/scan.js` | CLI command |

### Data stores

- **SQLite (existing)**: scan results, user accounts, subscriptions
- **Qdrant (existing)**: package name embeddings (for typosquat)
- **Flat files (new)**: top-10k npm package list (rebuilt weekly), URLhaus CSV (rebuilt daily)

---

## 11. Success metrics per release

### MVP
- 200+ scans in week 1
- 30%+ of users come back within 7 days
- 5+ positive reactions on HN/Reddit/X launch (not just upvotes, actual engagement)
- Zero security incidents (nobody claims we falsely greenlit a malicious skill)

### V2
- 100+ GitHub repos using the GitHub Action
- 50+ MCP tool invocations per day
- 5+ skill publishers displaying the badge voluntarily
- $0 spent on ads

### V3
- 20+ orgs/marketplaces using watch mode
- 1+ real-world security incident caught and publicly credited
- Inbound interest from 1+ marketplace (sickn33, lobehub, or claudepluginhub)
- 500+ scans per day

### V4
- 3 paying enterprise customers
- $2k+ MRR
- 1 "landing page of record" mention (Changelog, Thunder Nerds, or similar podcast)

### Global kill metric

**If at end of week 6 we have <10 daily scans + 0 inbound from marketplaces → shutdown. The thesis is wrong.**

---

## 12. Risks & mitigations

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Snyk / Socket.dev pivot to skills | Medium | Move fast. 6-week MVP. Claim the niche before they see it. |
| R2 | Anthropic ships native skill validation | Medium-High | Position as cross-platform (OpenAI, Cursor, Copilot). Our independence is the moat vs single-vendor. |
| R3 | False positives erode trust | High | Conservative defaults (default = YELLOW not RED). Clear "what would make this GREEN" explanations. |
| R4 | npm registry rate limit | Medium | Cache aggressively (24h). Use CDN mirror. Fall back to cached-stale with warning. |
| R5 | Typosquat detection is noisy | Medium | Tune threshold (distance ≤ 2 + not-in-top-10k). Ship conservative first, loosen with data. |
| R6 | Aikido-style article dies off (one-shot news) | Medium | Story doesn't rely on one article. AI supply chain is a sustained trend. But hedge: diversify distribution (don't rely on news cycles). |
| R7 | Solo founder burnout | Very High | 2-week MVP hard deadline. No scope creep. Ship ugly, iterate. Weekly review of time spent vs outcomes. |
| R8 | Can't get to 5 users in 30 days | Medium | This is the pre-validation gate (section 2). If pre-validation fails, DON'T BUILD. |

---

## Appendix: references

- [Aikido: Agent Skills Are Spreading Hallucinated npx Commands](https://www.aikido.dev/blog/agent-skills-spreading-hallucinated-npx-commands) - the catalyzing article
- [Anthropic Skills repo](https://github.com/anthropics/skills) - official Skills standard
- [sickn33/antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills) - 1400+ skills aggregator (prime target)
- [lobehub Skills Marketplace](https://lobehub.com/skills) - alt marketplace
- [Claudepluginhub](https://www.claudepluginhub.com) - alt marketplace
- [AST-based hallucination detection paper](https://arxiv.org/abs/2601.19106) - academic prior art
- [Mitigating Code LLM Hallucinations with API Documentation](https://arxiv.org/abs/2407.09726) - academic prior art
- Existing anti-hallucination skills (prior art we are NOT duplicating):
  - [arturseo-geo/grounded-research-skill](https://github.com/arturseo-geo/grounded-research-skill)
  - [christianestay/claude-code-base-project](https://github.com/christianestay/claude-code-base-project)
  - [instantX-research/anthropic-anti-hallucinate-skills](https://github.com/anthropics/skills)
- Internal beepack docs:
  - [validation-plan.md](./validation-plan.md) - predecessor validation plan (now superseded by section 2 of this doc)
  - [niche-roadmap.md](./niche-roadmap.md) - old package roadmap (now archived - pivot away from packages)
