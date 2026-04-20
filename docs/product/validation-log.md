# Validation Log - Outreach Tracker

> **Created:** 2026-04-20
> **Deadline:** 2026-05-20 (30-day validation window - see `validation-plan.md`)
> **Goal:** 5 distinct non-proches users pull at least one package; 3+ come back with signal.

---

## How to use this log

1. Pick a lead from the table below
2. Copy the "Draft reply" into the source (HN, Reddit, etc.)
3. Update `Posted at` with the timestamp
4. Wait 48-72h, check if they replied
5. If they pulled a package (log shows downloads), record in `Pulled?`
6. Update `Outcome` weekly

**Rule:** never paste the draft verbatim without reading the current thread context - comments move fast and a stale reply looks spammy.

---

## Weekly KPI check (every Sunday 18:00)

| Week | Posted | Replies received | Pulls attributed | Engaged users so far |
|---|---|---|---|---|
| W1 ending 2026-04-27 | 0 | 0 | 0 | 0 |
| W2 ending 2026-05-04 | - | - | - | - |
| W3 ending 2026-05-11 | - | - | - | - |
| W4 ending 2026-05-18 | - | - | - | - |

**W2 checkpoint rule:** if `Posted` < 5 OR `Replies received` = 0 after 2 weeks, change channel. Don't keep grinding what isn't working.

**W4 kill criteria (from validation-plan.md):**
- Engaged users 0-1 → shutdown beepack
- 2 silent pulls → pivot again or shutdown
- 3-4 engaged → extend 2 weeks
- 5+ engaged → unlock niche roadmap

---

## Batch 1 - HN leads (2026-04-20 agent scan)

### Lead #1 - jasonthorsness | STRONG MATCH
- **Source:** https://news.ycombinator.com/item?id=43129461
- **Date of original comment:** 2025-02-21 (old - be aware, thread may be cold)
- **Thread:** Ask HN: Designing for AI
- **Their pain:** "I tried using AI to help me with nextauth/auth.js and it took me on some crazy tour of v3, v4, v5 before I just read the docs and got it working."
- **Our package:** `nextauth-setup`
- **Draft reply:**

  > Exact same experience is why I packaged a working v5 App Router setup: https://beepack.ai/package.html?slug=nextauth-setup. Drop it in, have the agent read the source, you skip the v3/v4 detour.

- **Posted at:** _[fill in]_
- **Reply from dev:** _[fill in]_
- **Pulled?** _[fill in]_
- **Outcome:** _[fill in]_

---

### Lead #2 - schreibertuc | INDIRECT MATCH
- **Source:** https://news.ycombinator.com/item?id=47418560
- **Date:** 2026-03-17
- **Thread:** Show HN: Need - CLI discovery as MCP
- **Their pain:** "every time I ask Claude or Cursor to use a CLI tool, it either hallucinates a package name or recommends something outdated."
- **Our package:** `nextauth-setup` (analogous pain, not CLI-specific)
- **Draft reply:**

  > Agreed - we took the same angle for a narrow set of libraries where LLMs keep hallucinating. Auth.js v5 is the worst offender: https://beepack.ai/package.html?slug=nextauth-setup. Curious what your hit-rate looks like on auth-related queries.

- **Posted at:** _[fill in]_
- **Reply from dev:** _[fill in]_
- **Pulled?** _[fill in]_
- **Outcome:** _[fill in]_

---

### Lead #3 - instalabsai | STRONG MATCH (2 packages)
- **Source:** https://news.ycombinator.com/item?id=46944276
- **Date:** 2026-02-09
- **Thread:** Ask HN: What are you working on? (Feb 2026)
- **Their pain:** "I can build something amazing in 40 mins but then spend 4+ hours debugging because the agent has no idea how the libraries it's calling actually work."
- **Our packages:** `nextauth-setup` + `linear-api`
- **Draft reply:**

  > Same pain, solved by shipping tiny source-only packages the agent can read end-to-end. Auth.js v5 and Linear GraphQL are our two worst offenders today: https://beepack.ai/package.html?slug=nextauth-setup, https://beepack.ai/package.html?slug=linear-api.

- **Posted at:** _[fill in]_
- **Reply from dev:** _[fill in]_
- **Pulled?** _[fill in]_
- **Outcome:** _[fill in]_

---

### Lead #4 - yjcho9317 | STRONG MATCH (most recent)
- **Source:** https://news.ycombinator.com/item?id=47687468
- **Date:** 2026-04-08
- **Thread:** Show HN: Lilith-zero MCP middleware
- **Their pain:** "Claude Code will happily call tools in a loop with hallucinated parameters. Saw it happen more than once."
- **Our package:** `linear-api`
- **Draft reply:**

  > Hit this exact thing with Linear's GraphQL client - agents invent field names that moved in the last schema update. Typed wrapper here if it helps: https://beepack.ai/package.html?slug=linear-api.

- **Posted at:** _[fill in]_
- **Reply from dev:** _[fill in]_
- **Pulled?** _[fill in]_
- **Outcome:** _[fill in]_

---

### Lead #5 - trcarney | SOFT MATCH
- **Source:** https://news.ycombinator.com/item?id=47589097
- **Date:** 2026-03-31
- **Thread:** Are you team MCP or team CLI?
- **Their pain:** "I prefer the Linear API because...we have come up with our way of using the tool so I don't need the entire MCP to do what I need the agent to do."
- **Our package:** `linear-api`
- **Draft reply:**

  > +1 on skipping the full MCP for Linear. If you want a thinner layer the agent can read as source rather than discover at runtime: https://beepack.ai/package.html?slug=linear-api.

- **Posted at:** _[fill in]_
- **Reply from dev:** _[fill in]_
- **Pulled?** _[fill in]_
- **Outcome:** _[fill in]_

---

### Lead #6 - Kuraptka | MATCH (CMS detection)
- **Source:** https://news.ycombinator.com/item?id=46899540
- **Date:** 2026-02-05
- **Thread:** Ask HN: Any Recommended Alternative to Wappalyzer?
- **Their pain:** "Is there a tool (open source preferably or inexpensive) that can show me the entire tech stack of a company?...Wappalyzer excels at detecting frontend frameworks but struggles with infrastructure tools."
- **Our package:** `cms-detector`
- **Draft reply:**

  > Not a full Wappalyzer replacement, but for the CMS + JS framework + analytics slice we open-sourced the heuristic signatures here: https://beepack.ai/package.html?slug=cms-detector. Pulls cleanly into a server-side pipeline if the extension angle isn't your priority.

- **Posted at:** _[fill in]_
- **Reply from dev:** _[fill in]_
- **Pulled?** _[fill in]_
- **Outcome:** _[fill in]_

---

### Lead #7 - 01100011 | GENERIC PAIN (verified)
- **Source:** https://news.ycombinator.com/item?id=47550462
- **Date:** 2026-03-28 (approx)
- **Thread:** Why are executives enamored with AI, but ICs aren't?
- **Their pain:** "My experience is that it gets the syntax right but constantly hallucinates APIs and functions that don't exist but sound like they should."
- **Our package:** broad match (nextauth-setup + linear-api most relevant)
- **Draft reply:**

  > We built a narrow registry for exactly this failure mode - hand-curated source for APIs where LLMs keep inventing methods. https://beepack.ai - Auth.js v5 and Linear GraphQL are the two most requested right now.

- **Posted at:** _[fill in]_
- **Reply from dev:** _[fill in]_
- **Pulled?** _[fill in]_
- **Outcome:** _[fill in]_

---

### Lead #8 - andsoitis | GENERIC PAIN (verified)
- **Source:** https://news.ycombinator.com/item?id=47434538
- **Date:** 2026-03-19 (approx)
- **Thread:** The SDLC Is Dead
- **Their pain:** "realize the AI hallucinated an API that doesn't exist → fix → discover it broke something else"
- **Our package:** `nextauth-setup` (or broad)
- **Draft reply:**

  > The "hallucinated API that doesn't exist" tax is exactly why we ship working source for the libs agents get wrong most (Auth.js v5 at the top): https://beepack.ai/package.html?slug=nextauth-setup.

- **Posted at:** _[fill in]_
- **Reply from dev:** _[fill in]_
- **Pulled?** _[fill in]_
- **Outcome:** _[fill in]_

---

## Batch 2 - Reddit leads (2026-04-20 via reddit-scan.py)

HN filter too strict (14-day auto-archive). Added Reddit scan (posts stay active months). Scanner at `scripts/reddit-scan.py`. Keep only actionable leads - filtering out self-promo and generic "AI bad" threads.

### Lead R1 - singh_taranjeet | PARTIAL MATCH (nextauth mentioned)
- **Source:** https://www.reddit.com/r/ClaudeAI/comments/1seujth/claude_code_was_making_me_reexplain_my_entire/
- **Date:** 2026-04-07 (~13 days)
- **Sub:** r/ClaudeAI
- **Pain:** "Every time I started a Claude Code session... 'Ok so this project uses Next.js 14, PostgreSQL with Prisma, we auth with NextAuth, tokens expire after 24 hours...' Claude wakes up with complete amnesia every single time."
- **Our package:** `nextauth-setup` (indirect - he's complaining about context re-loading, not auth.js per se)
- **Draft reply:**

  > The NextAuth piece specifically is a good candidate for vendoring the source into the repo itself - Claude can read the file and the context is durable across sessions. This is what beepack does for auth.js v5: https://beepack.ai/package.html?slug=nextauth-setup. Pull it into `/lib/auth`, the agent stops re-discovering it every session.

- **Posted at:** _[fill in]_
- **Reply from dev:** _[fill in]_
- **Pulled?** _[fill in]_

---

### Lead R2 - Big_Birthday_1884 | STRONG PAIN MATCH (generic hallucination)
- **Source:** https://www.reddit.com/r/cursor/comments/1sd5qsk/the_native_autocomplete_models_in_modern_editors/
- **Date:** 2026-04-05 (~15 days)
- **Sub:** r/cursor
- **Pain:** "Native GPT 4o will confidently generate the new files and then completely hallucinate the import paths in the parent component. DeepSeek Coder is incredibly fast but will randomly strip out unrelated state logic during a multi file edit."
- **Our package:** broad (nextauth-setup + linear-api)
- **Draft reply:**

  > Same diagnosis. The fix that's worked for us: for the subset of libs where this fails predictably (Auth.js v5, Linear GraphQL, a few others), vendor the source into the repo rather than relying on the model's memory. Tiny registry of these here: https://beepack.ai. The import path confusion goes away when there's actual code to read.

- **Posted at:** _[fill in]_
- **Reply from dev:** _[fill in]_
- **Pulled?** _[fill in]_

---

### Lead R3 - Adorable_Albatross94 | WEAK MATCH (SKIP - migration story, not pain)
- **Source:** https://www.reddit.com/r/webdev/comments/1sett3u/
- **Date:** 2026-04-07
- **Reason to skip:** Scanner flagged high pain score but the post is a success story / war story about AngularJS → React 19 migration, not a hallucination complaint. Posting there would be off-topic and get downvoted.

---

## Backlog - channels to scan manually

The Claude Code environment can't reach Reddit or Stack Overflow. You'll need to scan these yourself (or from a regular browser).

### Reddit queries (worth 10 minutes each, weekly)

- `site:reddit.com "nextauth v5" hallucinate` (Google)
- `site:reddit.com "auth.js v5" broken app router`
- r/nextjs search: "auth.js v5", "nextauth migration", sort by New, last month
- r/reactjs search: "hallucinate", "made up", last month
- r/cursor search: "auth.js", "nextauth", "linear", last month
- r/ClaudeAI search: "made up", "doesn't exist", last month
- r/webdev search: "ai generated code" broken, last month

### Stack Overflow (for SIRET, CDN, CMS)

- Unanswered questions tagged `next-auth` with "v5" recent
- Unanswered `[linear-api]` tag
- Unanswered questions mentioning "AI generated"

### GitHub Discussions

- github.com/nextauthjs/next-auth/discussions - filter by "question" label, last 60 days
- github.com/linear/linear-sdk/issues - filter by OP mentioning AI

### Twitter/X (requires your account)

- Search "claude hallucinated auth" / "gpt wrong nextjs" / "linear api claude"
- Most valuable signal: devs posting code snippets of AI output that's wrong

---

## Gap analysis after Batch 1

No leads found for:
- `cdn-url-cleaner` (scraping / CDN URL parsing)
- `siret-utils` (French business IDs - expected given international pivot)

**Hypothesis:** these pains are solved silently. Scrapers don't post about CDN quirks - they just parse it. SIRET validators are either correct or silently wrong.

**Implication for validation:** if Batch 1 yields 0 pulls after 2 weeks, `cdn-url-cleaner` and `siret-utils` might be the wrong niches for this validation cycle. Consider narrowing focus to `nextauth-setup` + `linear-api` (the two where the pain is vocalized).
