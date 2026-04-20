# Beepack - Product Hunt Launch Kit

> **ARCHIVED (2026-04-20).** This launch kit predates the pivot to the French/regulatory niche. The tagline, positioning, and talking points below all reference the broad "npm for vibecoding / 43 packages" narrative that no longer holds. Do not launch against this kit. A new launch should wait until the 5-user validation phase is complete and the niche positioning has received organic traction.

> Target launch: Tuesday, May 5, 2026 (12:00 AM PT) - **postponed pending validation**

---

## 1. Tagline

**Primary (60 chars):**
> The npm for vibecoding — battle-tested code your AI can pull

**Backup options (shorter):**
- "Stop vibe-debugging. Start vibe-shipping."
- "Battle-tested code for the hard stuff."
- "The registry your AI wishes it had."

---

## 2. Short Description (260 chars max)

> Beepack is an open-source registry of battle-tested code snippets for AI-assisted development. Pull OAuth flows, PDF parsers, Stripe webhooks — code that already survived production edge cases. MCP-native so Cursor and Claude Code can pull directly without copy-paste.

*(258 chars)*

---

## 3. Long Description

**Beepack — The open-source registry of battle-tested code for AI-assisted development**

---

**The problem every vibecoder knows:**

Your AI is fast. It confidently writes an OAuth flow in 30 seconds. Then you discover it forgot token refresh. Then PKCE. Then the edge case where Google sends a different callback format on mobile. Four hours later, you're still debugging.

It's not AI's fault — it's never seen *your* production environment. Every team re-debugs the same patterns from scratch.

---

**What Beepack does:**

Beepack is a curated registry of code that already survived those edge cases. You pull the source, adapt it to your project, and ship — no runtime lock-in, no black-box dependency.

**33 packages available today**, including:
- `github-oauth` — OAuth with token refresh, rate limits, and GHES support
- `stripe-checkout` — Webhooks, idempotency keys, failed payment retries
- `pdf-invoice` — Template engine, multi-page layouts, font embedding
- `openai-streaming` — Streaming responses, cancellation, token counting
- `rate-limiter` — Sliding window, Redis-backed, per-user and per-IP

---

**Why it's different from npm / PyPI:**

| | npm package | Beepack package |
|---|---|---|
| What you get | Compiled runtime dependency | Full source code you own |
| AI feedback | None | Every package ships with "what worked / watch out for" |
| Security | Community maintained | 3-layer scan: static analysis + LLM eval + community reports |
| AI-native | No | MCP server — pull directly from Cursor, Claude Code, etc. |

---

**AI-native by design:**

Add one line to your MCP config and your AI can search and pull Beepack packages without leaving the coding session:

```json
{ "mcpServers": { "beepack": { "url": "https://beepack.ai/mcp/sse?token=YOUR_TOKEN" } } }
```

**ClawHub/OpenClaw compatible** — `clawhub install beepack` works out of the box.

---

**Security you can see:**

Every package goes through a 3-layer pipeline:
1. Static scan — blocks `eval()`, `child_process` abuse, credential harvesting at publish time
2. LLM evaluation — async analysis for obfuscated code and subtle threats
3. Community reports — 3 independent flags auto-hides a package pending manual review

---

**Open source, self-hostable:**

MIT licensed. Run your own instance with `git clone` + `npm install`. All 33 packages are in the repo and usable today.

---

## 4. Gallery — 5 Screenshots / Visuals

*Each screenshot should be 1270×952px (Product Hunt recommended). Descriptions below serve as briefs for visual creation.*

---

### Screenshot 1: CLI in Action (hero shot)

**What to show:**
Terminal with dark background (pixel-art/retro aesthetic). Running:
```
$ beepack search "stripe payment"
  stripe-checkout  — Stripe Checkout + webhooks with idempotency  ★★★★★
  lemonsqueezy-payments  — LemonSqueezy billing API integration  ★★★★☆
$ beepack pull stripe-checkout
  ✓ Pulled stripe-checkout v1.0.0 → ./beepack/stripe-checkout/
  ✓ Security scan: PASSED
  ✓ 3 AI feedback notes included
```

**Caption:** "Pull battle-tested code in seconds. Security-scanned. AI feedback included."

---

### Screenshot 2: Package Browser (website)

**What to show:**
The beepack.ai package listing page. Grid of package cards showing:
- Package name + icon
- Short description
- Star rating
- Security badge (green checkmark)
- "Pull" button
Highlight the 33-package count prominently. Show the search bar with a query like "oauth".

**Caption:** "33 packages covering the integrations AIs struggle with most."

---

### Screenshot 3: MCP Integration in Cursor

**What to show:**
Cursor IDE screenshot with the AI chat panel open. The AI is responding to "add Stripe checkout to my project" and has used the Beepack MCP tool. Show:
- MCP tool call: `search_packages("stripe checkout")`
- Tool response listing packages
- AI message: "I found `stripe-checkout` on Beepack — pulling it now..."
- Cursor sidebar showing `beepack/stripe-checkout/` folder appeared

**Caption:** "Your AI pulls production-grade code without leaving the session. Zero copy-paste."

---

### Screenshot 4: Package Detail — AI Feedback

**What to show:**
Package detail page for `github-oauth`. Highlight the "AI Feedback" section showing real notes like:
- "✅ Works: PKCE flow handles mobile Safari correctly"
- "⚠️ Watch out: GitHub Enterprise uses a different base URL — check GITHUB_BASE_URL env"
- "ℹ️ Token refresh: access tokens don't expire by default, but org-level tokens rotate after 8 hours"

Show the security scan result (PASSED, all 3 layers).

**Caption:** "Every package ships with what worked — and what to watch out for. From real AI runs."

---

### Screenshot 5: Security Pipeline Transparency

**What to show:**
Security dashboard or package security tab. Show a visual of the 3-layer pipeline:

```
PUBLISH → [Static Scan ✓] → [LLM Eval ✓] → [Community ✓] → LIVE
```

Below: a sample static scan report showing:
- No dangerous patterns detected
- No credential harvesting
- No data exfiltration patterns
- No obfuscated code

Also show the "Report" button for community reporting.

**Caption:** "3-layer security on every publish. Static scan + AI eval + community reports. Trust but verify."

---

## 5. Maker's First Comment

*Post this within the first 10 minutes of launch to seed discussion.*

---

Hey Product Hunt! 👋

I'm [name], and I built Beepack after watching the same pattern repeat on every AI-assisted project: the AI writes plausible code fast, then you lose hours on the edge cases it missed.

OAuth token refresh. PDF parsing with corrupt files. Rate limits under load. Stripe webhooks with idempotency. **These aren't AI problems — they're patterns that need real production mileage.**

Beepack is my attempt at a registry for that mileage. Instead of publishing compiled packages (like npm), you pull actual source code that's been through the edge cases. Adapt it, own it, ship it.

**What makes it different:**
- Every package ships with AI feedback notes — the "what worked / watch out for" from real runs
- 3-layer security pipeline on every publish (static scan + LLM eval + community reports)
- MCP-native — Cursor, Claude Code, and OpenClaw users can pull packages without leaving their session

We have **33 packages** in the registry today covering the integrations I see trip up AI-generated code the most. The repo is MIT-licensed and fully self-hostable.

Would love to know: **what integration have you spent the most time debugging with AI?** That's exactly what Beepack should have next.

Thanks for the upvotes and questions — I'll be here all day! 🐝

---

## 6. Typical Q&A — Pre-prepared Responses

---

**Q: How is this different from just copying code from GitHub?**

A: Three things: (1) curation — every package is specifically built to handle the edge cases, not just the happy path; (2) AI feedback notes — each package documents what actually worked and what to watch for, from real AI-assisted runs; (3) the MCP integration means your AI can search and pull without breaking flow. GitHub is where you find the code; Beepack is where you find the *production-ready version*.

---

**Q: Why not just use npm?**

A: npm gives you a runtime dependency — a black box your app depends on. Beepack gives you source code you adapt and own. No versioning issues, no supply chain attacks on a published package, no update-and-hope. It's closer to a curated Stack Overflow answer than a dependency manager.

---

**Q: Isn't this dangerous? AI-published code that other AIs pull?**

A: Security is exactly why we built the 3-layer pipeline. Every package is scanned at publish time for dangerous patterns (eval abuse, credential harvesting, exfiltration). An LLM runs a separate async analysis for subtle threats. After 3 community reports, a package is auto-hidden. We publish the scan results on every package page so you can see exactly what passed.

---

**Q: Can I contribute packages?**

A: Yes! `beepack init` scaffolds a package structure with HIVE.yaml. Once you publish, the security pipeline runs automatically. We also have a Suggestions system — if you find a package that almost fits, you can suggest an enhancement instead of publishing a duplicate.

---

**Q: Does this work with [Cursor / Claude Code / Copilot / ChatGPT]?**

A: MCP works with any MCP-compatible client — Cursor, Claude Code, and others. ChatGPT doesn't support MCP yet but you can use the CLI (`beepack pull`) and paste the output. OpenClaw/ClawHub users can `clawhub install beepack` for native integration.

---

**Q: Is it really open source / can I self-host?**

A: Fully MIT. `git clone https://github.com/actabi/beepack && npm install` gets you running. You'll need GitHub OAuth credentials and optionally an OpenAI key for semantic search. The packages in the repo are all included.

---

**Q: What's on the roadmap?**

A: Next up: forks and pull requests (so the community can contribute improvements to existing packages directly, not just suggestions), CI test badges per package, and more packages across Tier 2 (we have 33 today, targeting 60 by Month 2). The community suggestion system already shows what's most requested.

---

## 7. Launch Strategy

### Timing

| Decision | Choice | Rationale |
|---|---|---|
| Day | **Tuesday, May 5, 2026** | Tue–Thu get the most PH traffic; avoid Monday (low) and Fri–Sun (weekend drop) |
| Time | **12:00 AM PT (Pacific)** | PH resets at midnight PT — go live at reset to maximize 24-hour window |
| Pre-announce | Monday May 4, evening | Tweet "launching tomorrow on PH" to prime the network |

---

### T-2 Weeks: Prep Checklist

- [ ] Finalize all gallery assets (5 screenshots per brief above)
- [ ] Record 60-second demo video: AI in Cursor pulls `github-oauth` via MCP and ships working OAuth in minutes
- [ ] Build supporter list (target 30+ people who will upvote at launch):
  - Discord: Cursor community, Indie Hackers, AI dev Discords
  - Twitter/X: DM engaged followers who've liked Beepack posts
  - Personal network: colleagues, past collaborators
- [ ] Set up "coming soon" page on beepack.ai with email capture
- [ ] Draft and schedule launch-day tweet thread (5 tweets ready to fire at midnight)
- [ ] Write LinkedIn announcement post (schedule for 8 AM PT launch day)

---

### T-1 Week: Outreach

- [ ] Post "launching next week on PH" on Twitter, tag relevant accounts
- [ ] Submit to relevant newsletters for mention (TLDR AI, The Rundown, Latent Space)
- [ ] Reach out to 5–10 AI dev influencers for early access / feedback
- [ ] Hunters to contact (DM on PH or Twitter):

| Hunter | Why relevant | Account |
|---|---|---|
| Fabian Maume | Open source tools, dev tooling | @fabian_maume |
| Kevin William David | Top PH hunter, dev tools focus | @kwdinc |
| Chris Messina | Invented the hashtag, active PH hunter | @chrismessina |
| Lior Neu-ner | AI tools, high volume hunter | @lior_ner |
| Saijo George | Dev tools & AI, consistent hunter | @SaijoGeorge |

*Ask hunters to hunt you — this gives a credibility boost and the hunter's network gets notified.*

---

### Launch Day (May 5): Minute-by-Minute

| Time (PT) | Action |
|---|---|
| 12:00 AM | Go live on PH (posting scheduled in advance or posted at midnight) |
| 12:05 AM | Post maker's first comment (use template in Section 5) |
| 12:10 AM | Fire tweet 1: "We're live on Product Hunt! [link] — here's why I built it 🧵" |
| 12:15 AM | DM supporter list with direct PH link and "we're live!" message |
| 7:00 AM | Tweet 2: Morning boost — "Good morning PH! Ask me anything about Beepack" |
| 9:00 AM | LinkedIn announcement post |
| 12:00 PM | Tweet 3: midday update with stats ("X upvotes, thank you!") |
| 5:00 PM | Reply sprint: respond to all PH comments, engage with upvoters |
| 8:00 PM | Tweet 4: "6 hours left — one more push 🙏" |
| 11:00 PM | Final tweet: thank-you regardless of placement |

---

### Post-Launch

- [ ] Write a "lessons learned" thread on Twitter regardless of placement
- [ ] Follow up with everyone who commented on PH (DM or email)
- [ ] Convert PH traffic with a simple signup CTA on beepack.ai
- [ ] Submit a Show HN within 48 hours while momentum is high
- [ ] Post results publicly: "We hit X on Product Hunt. Here's what worked."

---

### Success Metrics (PH-specific)

| Metric | Target |
|---|---|
| Final placement | Top 5 of the day |
| Upvotes | 500+ |
| Comments | 30+ |
| Website visits from PH | 1,000+ |
| Email / GitHub signups from PH traffic | 100+ |
| CLI installs within 48h of launch | 50+ |
