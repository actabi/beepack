# Beepack - 5-User Validation Plan

> **Created:** 2026-04-20
> **Status:** Active - gates all new package work
> **Owner:** gdelaroque@erama.co

---

## Why this plan exists

After the 2026-04-20 pivot, Beepack has 5 packages and a narrow positioning ("integrations where LLMs still hallucinate - French regulatory, domain heuristics, breaking-change zones"). The competitive research showed:

- Real pain exists (vibe-coded integrations breaking in prod, French regulatory gaps)
- But "code registry for vibe coders" is absent from PainIndex top 5 vocalized pains
- Anthropic Skills + LAP Marketplace + SkillsMP already occupy the generic slot
- Zero organic chatter about beepack or "AI code registry"

**Conclusion:** Before building a 6th package, validate that the current 5 actually solve a real pain for 5 real users. If not, the pivot is wrong and we pivot again (or stop).

---

## Success criteria (must all be true)

Within **30 days** (deadline: 2026-05-20):

1. **5 distinct users** (not personal contacts, not employees, not sock-puppets) have **actually pulled** at least one package into a real project.
2. At least **3 of the 5** come back unprompted with either: a suggestion, a feedback, a bug report, or a "thanks it worked". Silent pulls don't count.
3. At least **1 of the 5** asks for a package we don't have yet - and the ask falls inside the niche (French regulatory, domain heuristics, breaking-change zone).
4. At least **3 of the 5** can articulate the positioning back (when asked "what is beepack for?"): some variant of "for the APIs where Claude/GPT hallucinates."

**If < 3/4 criteria are met:** the pivot is not validated. Stop building. Reconsider: either pivot again, or wind down.

**If 4/4 met:** unlock the niche roadmap. Build urssaf, pappers, franceconnect in priority order.

---

## Target user profile

One of:

- **French indie hacker / solo dev** shipping a SaaS or marketplace on French market (needs SIRET/TVA/URSSAF)
- **Dev agency in France** building B2B tools (Chorus Pro, DSN integrations)
- **AI-native dev** who just got burned by a hallucinated Auth.js v5 config, Linear GraphQL schema, or CDN URL parse
- **Open-source maintainer** on a French-targeted library

**Not counted as validation:**
- Personal network (friends, colleagues, ex-teammates)
- Anyone you paid or bartered with
- Anyone who pulled and immediately went silent with no use signal

---

## Recruitment plan (in priority order)

### Channel 1: Post-mortem hunting (highest signal)

Scan the places where the pain is **already vocalized**:

- **r/ChatGPTCoding, r/cursor, r/ClaudeAI** (last 30 days) - search for "hallucinated API", "wrong endpoint", "SIRET", "URSSAF", "nextauth v5"
- **HN comments** on AI coding tool threads - look for "LLM got X wrong"
- **X/Twitter FR dev community** - search "claude code faux", "gpt a inventé", "hallucin"
- **IndieHackers forums** - "French" + "API" threads

When you find someone complaining about a hallucinated integration:
1. Reply with: "We built this exact thing at beepack.ai - here's the [package link]. Pull it, see if it works, and tell me what's still broken."
2. Track: did they pull? Did they come back?

**Target:** 2 users from this channel.

### Channel 2: French dev communities

- **Discord: Indie Makers FR, French Tech, GrafikArt, Alsacreations**
- **Slack: French Tech, ShapeOfThings, OpenClassrooms alumni**
- **IRL:** Paris JS, NodeSchool Paris, France AI

Don't announce. Lurk 1 week, find a conversation about a broken French API integration, drop the relevant package link as an answer.

**Target:** 2 users from this channel.

### Channel 3: Direct outreach (last resort, lowest quality signal)

5-10 cold emails to French solo devs / agencies that blog about building on SIRET or URSSAF APIs. Format:

> "I'm building [beepack.ai/use-cases/api-integration-library.html] - a narrow code registry for APIs where LLMs still hallucinate. You wrote about [their blog post]. Would you try [specific package] and tell me if it saved you time or wasted it? Raw feedback welcome - I'd rather shut it down than pretend it works."

**Target:** 1 user. Note: this channel's signal is weaker because respondents often just want to be helpful rather than actually needing the tool.

---

## Instrumentation (what to track)

Add **minimal** telemetry on the server side (no third-party analytics needed):

| Metric | How | Purpose |
|---|---|---|
| Package pulls (anon IP hash + slug + timestamp) | server log | count unique pullers |
| Referral source (referer header on / and /explore.html) | server log | identify which channel worked |
| MCP tool calls by session | existing MCP server log | prove AI-driven discovery works |
| Feedback submissions | existing DB table | proof of engagement |
| Suggestions submitted | existing DB table | proof of continued interest |

**Do not:**
- Add Plausible, Mixpanel, or any third-party tracker (violates the "open source first" rule)
- Require signup before pulling (kills friction - we want pulls)
- Store PII - IP hashes and hashed user agents only

---

## Weekly check-in (every Sunday 18:00)

Update the bottom of this file with:

| Week | Unique pullers | Feedback/suggestions | Source channel breakdown |
|---|---|---|---|
| W1 (2026-04-27) | ? | ? | ? |
| W2 (2026-05-04) | ? | ? | ? |
| W3 (2026-05-11) | ? | ? | ? |
| W4 (2026-05-18) | ? | ? | ? |

**At W2:** if you have 0-1 unique puller, that's the signal to change recruitment channels, not to keep grinding the same one.

**At W4:** write the verdict - validated / not validated / inconclusive (in which case extend 2 weeks max then decide).

---

## What NOT to do during validation

- Do not ship a 6th package. Every ounce of energy goes to validation.
- Do not rewrite the site again. Hero is now narrow - let it breathe.
- Do not add features (likes, bundles beyond fr-business-starter, new analytics). Feature drift = avoidance of the hard question.
- Do not post "we just launched!" on HN or Product Hunt - those channels work for polished products with early organic users, not the reverse.
- Do not ask friends and call it validation. Friends validate emotionally, not with their time.

---

## Kill criteria

If at W4:

- 0-1 unique pullers -> **shut down**. The niche hypothesis is wrong or the distribution is impossible for a solo founder. Write a retro and move on.
- 2 unique pullers, no feedback/suggestions -> **pivot again** or shut down. They pulled once out of curiosity, not need.
- 3-4 unique pullers with some engagement -> **extend 2 weeks**. Ambiguous signal. One more loop of recruitment focused on the channel that worked.
- 5+ with real engagement -> **validated**. Unlock niche roadmap.

---

## Notes

- This is a real discipline, not a script. If something unexpected happens (e.g., one user writes a Medium post and brings 50 others), update the plan, don't stick to it blindly.
- The point of killing after W4 is to avoid the solo-founder trap of adding features forever to a product nobody uses.
- If kill triggers fire, that is a win: 30 days instead of 6 more months of building into silence.
