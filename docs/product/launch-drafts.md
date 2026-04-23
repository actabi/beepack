# M-10 Launch drafts (paste-ready)

Everything below is ready to copy. The scanner is live at https://beepack.ai and https://beepack.ai/scan.

**Pre-launch chore (required for CLI mentions):** bump `cli/package.json` version and `npm publish` so `npx @actabi/beepack scan <url>` works. Until then, keep CLI references vague ("CLI shipping this week") or drop the CLI line.

---

## 1. Show HN

**When:** Tue, Wed, or Thu, 9:00 AM PT (18:00 Paris). Today (2026-04-22) is Wed, prime slot.
**URL:** https://news.ycombinator.com/submit
**Title (80 char max):**
```
Show HN: Beepack Scan, open-source safety scanner for Claude Code skills
```

**URL field:**
```
https://beepack.ai
```

**Text field (optional but recommended, add once submitted):**
```
Hi HN, I built this in response to Aikido's December 2025 report that AI agent
skills are shipping hallucinated `npx` commands. Those package names don't
exist on npm, which makes them a trivial typosquat vector: the first person to
register `@anthropic/skill-runner-plus` owns every machine that runs the skill.

Beepack Scan takes a SKILL.md (paste URL, drop file, or paste markdown), pulls
out every npx, pip install, curl, and import deterministically (no LLM), then
validates against:

- npm registry (404 = block)
- PyPI (existence + metadata)
- Levenshtein vs top npm/pypi lists (distance 1 = block, 2 = warn)
- URLhaus blocklist (26k known-bad URLs, updated daily)
- RDAP for domain age (<30 days = warn)
- Pastebin/tunnel hosts (ngrok, trycloudflare, pastebin, serveo)

Output: RED / YELLOW / GREEN with findings and exact line references. No LLM
in the loop, so results are reproducible. Runs on your machine or ours, MIT.

Source: https://github.com/actabi/beepack
Try without signup: https://beepack.ai/scan

Happy to answer questions about the heuristics or false-positive tuning.
```

---

## 2. r/ClaudeAI

**URL:** https://www.reddit.com/r/ClaudeAI/submit
**Type:** Link post OR text post (text post gets more engagement)
**Title:**
```
I built an open-source scanner for the Aikido skill-security issue (hallucinated npx in Claude Code skills)
```

**Body (text post):**
```
Background: in December 2025 Aikido showed that many Claude Code skills on
community marketplaces reference npm packages that don't actually exist. An
attacker who registers those package names with malware owns every machine
that installs the skill.

https://www.aikido.dev/blog/agent-skills-spreading-hallucinated-npx-commands

I couldn't find a tool that specifically validates skill installs, so I built
one. Called Beepack Scan. It extracts every npx, pip install, curl, URL, and
import from a SKILL.md (plus scripts in the same folder), then hits the real
registries and blocklists.

What it catches:

- Hallucinated packages (npm/PyPI 404) = RED
- Distance-1 typosquats against top 5k npm + top 1k pypi = RED
- URLhaus matches = RED
- Young domains (< 30 days) = YELLOW
- Pastebin/tunnel URLs (ngrok, trycloudflare, pastebin) = YELLOW
- Distance 2-3 + suspicious suffixes (-js, -cli) = YELLOW

Paste a GitHub repo URL or drop SKILL.md: https://beepack.ai/scan

Open source (MIT), no signup, fully deterministic so there's no LLM in the
loop and no tokens burned per scan. Source:
https://github.com/actabi/beepack

Would love feedback on the threshold calibration, especially from anyone
publishing or curating skill collections. Honest question: is RED-on-distance-1
too aggressive?
```

---

## 3. r/ChatGPTCoding

**URL:** https://www.reddit.com/r/ChatGPTCoding/submit
**Title (different angle, AI-agnostic):**
```
When your AI-generated install command is the attack: open-source scanner for hallucinated npx packages
```

**Body:**
```
Two months ago Aikido published a write-up showing that AI-generated agent
skills frequently include `npx somepackage` commands where `somepackage`
doesn't exist on npm. This is the perfect typosquat setup: squatter registers
the hallucinated name on npm, every AI user who runs the skill ships the
malware.

https://www.aikido.dev/blog/agent-skills-spreading-hallucinated-npx-commands

This happens beyond Claude Code, too. Anyone using Cursor, Copilot, GPT, or
Cline to generate shell snippets runs the same risk the moment a docs page
recommends an install step.

I built an open-source scanner that deterministically parses a skill (or any
markdown with install commands) and validates every reference:

- npm + PyPI existence check (404 = block)
- Levenshtein + suffix heuristics for typosquats
- URLhaus blocklist + RDAP young-domain check + pastebin/tunnel detection
- RED / YELLOW / GREEN verdict in 10 seconds

No LLM in the scan loop, no API keys, no signup. Free to use, MIT.

Web: https://beepack.ai/scan
Source: https://github.com/actabi/beepack

Curious how other folks here handle this. Do you manually audit AI-generated
install commands, or do you just run them?
```

---

## 4. X / Twitter thread

**When:** Same day as HN, pin the first tweet.

**Tweet 1 (hook):**
```
In Dec 2025, @AikidoSecurity showed that Claude Code skills ship `npx` commands referencing packages that don't exist on npm.

An attacker registers the hallucinated name, every install runs their malware.

I built the open-source scanner that catches it. Live: https://beepack.ai/scan
```
Attach the 30s screen capture (see video script below).

**Tweet 2:**
```
Paste a GitHub URL or drop a SKILL.md. It pulls every npx, pip install, curl, and import out deterministically (no LLM in the loop) and validates against:

-> npm registry
-> PyPI
-> URLhaus blocklist
-> RDAP for domain age
-> Levenshtein vs top 5k npm / top 1k pypi
```

**Tweet 3:**
```
Verdict in 10 seconds:

RED: package 404, distance-1 typosquat, URLhaus match
YELLOW: young domain, pastebin/tunnel URL, distance 2-3 match
GREEN: every reference resolves to a real, popular target

Reproducible because it's not LLM-based.
```

**Tweet 4:**
```
Free, open source (MIT), no signup. Works on anything that ships skill-style install instructions, not just @AnthropicAI's format.

Web UI: https://beepack.ai/scan
Source: https://github.com/actabi/beepack

Feedback on false positives welcome. Especially from marketplace operators.
```

**Tweet 5 (engagement):**
```
If you publish a skill and want a live safety badge on your README, DM me. Shipping that this week.

If you operate a marketplace (@sickn33's awesome-skills, @lobehub, Claudepluginhub), I'd love to talk about "display beepack score next to install".
```

### Video script (30s screen capture)

1. (0-3s) Cursor on https://beepack.ai. Read the hero.
2. (3-8s) Click "hallucinated package demo" button, lands on /scan with prefilled markdown.
3. (8-12s) Click "Scan for safety" button.
4. (12-18s) RED card appears, zoom on "package_does_not_exist" finding.
5. (18-22s) Go back to /scan, paste a real skill URL (pick a known-safe GitHub one).
6. (22-28s) GREEN card appears.
7. (28-30s) End card: URL + "open source".

Record with OBS or QuickTime at 1080p, trim to 30s, upload directly to X.

---

## 5. Aikido team DM

**Channel:** X DM to @AikidoSecurity + email to their press/contact from aikido.dev
**Subject (for email):** Built the scanner your December article predicted

**Body:**
```
Hi Aikido team,

Your December 2025 piece on agent skills spreading hallucinated npx commands
lit a fire under me. I couldn't find anyone actually building a skill-specific
scanner, so I shipped one this week:

https://beepack.ai/scan

It deterministically extracts every install command, URL, and import from a
SKILL.md and validates against npm / PyPI / URLhaus / RDAP plus Levenshtein
for typosquats. RED / YELLOW / GREEN verdict, no LLM in the loop, open source
(MIT).

Two asks:
1. Happy to credit your original article in a "why this exists" section on
   the landing (already there) and on the scan result page, if you're open to
   it.
2. If Aikido wants to syndicate scan results as a RSS / JSON feed (v3 on my
   roadmap, I'd prioritize if it fits your data), I'd love to collaborate.

Either way, thanks for publishing the disclosure. It mattered.

- Guillaume (gdelaroque@erama.co)
```

---

## Launch-day checklist

Rough order, same day:

1. 17:45 Paris: confirm beepack.ai + /scan + /api/v1/scan still respond. Run a
   sample scan to warm caches.
2. 18:00: submit Show HN (the time slot matters more than the day).
3. 18:05: post on r/ClaudeAI.
4. 18:10: post on r/ChatGPTCoding.
5. 18:15: publish the X thread, pin tweet 1.
6. 18:20: DM Aikido via X.
7. 18:25: email Aikido via the address on aikido.dev.
8. Monitor for 2h: answer every HN comment in 15 min or less.
9. 22:00 Paris: tally. If HN rank > 30 or any post got 20+ comments, the
   validation signal is live. Otherwise, no retries on this channel for 2
   weeks (avoid looking desperate).

## Tracking

Log results in `docs/product/validation-log.md` under a new "Batch 3 - launch"
section with:
- each URL (HN submission, Reddit posts, X thread)
- counts at T+2h, T+24h
- any beta-user DMs or marketplace-operator replies

---

## Post-launch maintenance (within 1 week)

- Publish `@actabi/beepack` CLI bump with the scan command so `npx @actabi/beepack scan <url>` actually works.
- Add cron on VPS: weekly `scripts/fetch-top-packages.js`, daily `scripts/fetch-urlhaus.js`, then `systemctl restart beepack`.
- Watch URLhaus false-positive rate. If > 2 false positives per 100 scans, tighten the rule set before promoting further.
