# Beepack SEO Plan

## Overview

Beepack targets developers and AI agents who need production-ready integrations without spending hours debugging edge cases. SEO strategy focuses on high-intent keywords across three clusters: tool-type terms, workflow terms, and integration-specific terms.

---

## Target Keyword Clusters

### Cluster 1: Tool-type (what Beepack is)

| Keyword | Intent | Priority | Target Page |
|---------|--------|----------|-------------|
| API integration library | informational / commercial | High | `/use-cases/api-integration-library.html` |
| reusable code registry | informational | High | `/use-cases/reusable-code-registry.html` |
| code package registry | informational | Medium | `/use-cases/reusable-code-registry.html` |
| npm for AI code snippets | informational | Medium | `/` (homepage) |
| code snippet marketplace | commercial | Medium | `/` (homepage) |

### Cluster 2: Workflow / audience (who uses it)

| Keyword | Intent | Priority | Target Page |
|---------|--------|----------|-------------|
| vibecoding tools | informational | High | `/use-cases/vibecoding-tools.html` |
| vibe coding packages | informational | High | `/use-cases/vibecoding-tools.html` |
| AI coding tools | informational | Medium | `/use-cases/vibecoding-tools.html` |
| battle-tested code for AI | informational | Medium | `/` (homepage) |
| production-ready code snippets | informational | Medium | `/` (homepage) |

### Cluster 3: Integration-specific (long-tail)

| Keyword | Intent | Priority | Target Page |
|---------|--------|----------|-------------|
| GitHub OAuth integration code | navigational | High | `/packages/github-oauth` |
| Stripe checkout integration | navigational | High | `/packages/stripe-checkout` |
| PDF invoice generator | navigational | High | `/packages/pdf-invoice` |
| Slack webhook integration | navigational | Medium | `/packages/slack-webhook` |
| rate limiter with retry | navigational | Medium | `/packages/rate-limiter` |
| Resend email integration | navigational | Low | `/packages/resend-email` |

---

## On-Page SEO Improvements

### Homepage (`/`)

**Current:**
- Title: `Beepack 🐝 - Stop recoding. Start shipping.`
- Description: `The package manager for vibe coders. Save tokens, skip debugging, ship faster with production-tested code.`

**Improved:**
- Title: `Beepack — API Integration Library for Vibe Coders`
- Description: `The reusable code registry for AI-powered development. Pull battle-tested OAuth, Stripe, PDF, and webhook integrations. Save hours, not minutes.`

**Additional meta to add:**
```html
<meta name="keywords" content="API integration library, reusable code registry, vibecoding tools, AI coding packages, battle-tested code">
<link rel="canonical" href="https://beepack.ai/">
<meta property="og:title" content="Beepack — API Integration Library for Vibe Coders">
<meta property="og:description" content="Pull battle-tested OAuth, Stripe, PDF, and webhook integrations. Skip the debugging, ship faster.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://beepack.ai/">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Beepack — API Integration Library for Vibe Coders">
<meta name="twitter:description" content="Pull battle-tested OAuth, Stripe, PDF, and webhook integrations. Skip the debugging, ship faster.">
```

### Search Page (`/search.html`)

**Improved:**
- Title: `Search API Integrations — Beepack`
- Description: `Search thousands of battle-tested API integrations. OAuth, payments, storage, webhooks and more — ready to pull into your project.`

### Package Page (`/package.html`)

- Title dynamically set per package: `{Package Name} — Beepack`
- Add `<meta name="robots" content="index, follow">` for indexed packages

### Bundle Page (`/bundle.html`)

- Title dynamically set per bundle: `{Bundle Name} Bundle — Beepack`
- Description dynamically set from bundle description

---

## Landing Pages to Create

### 1. `/use-cases/api-integration-library.html`

**Target keywords:** `API integration library`, `code integration library`, `npm for API integrations`

**Angle:** Beepack as the definitive library of plug-and-play API integrations for developers and AI agents.

**Sections:**
- Hero: "The API Integration Library Built for Speed"
- What's in the library (OAuth, payments, storage, messaging)
- How to pull an integration in 30 seconds
- Who uses it (AIs, vibe coders, indie hackers)
- CTA: Browse the library

### 2. `/use-cases/reusable-code-registry.html`

**Target keywords:** `reusable code registry`, `code package registry`, `code snippet registry`

**Angle:** Beepack as a shared registry where the community stores and retrieves production-tested code modules.

**Sections:**
- Hero: "The Reusable Code Registry for Production Apps"
- Why reuse over rewrite (edge cases, security, speed)
- How the registry works (HIVE.yaml, publish, pull)
- Registry stats
- CTA: Publish your first package

### 3. `/use-cases/vibecoding-tools.html`

**Target keywords:** `vibecoding tools`, `vibe coding packages`, `AI coding tools`, `tools for vibe coders`

**Angle:** Beepack as an essential tool in the vibe coder's toolkit — letting AI agents pull proven integrations instead of hallucinating from scratch.

**Sections:**
- Hero: "The Missing Tool for Vibe Coders"
- The problem with vibe coding from scratch (wrong edge cases, security holes)
- How Beepack fixes it (MCP integration, `beepack pull`)
- Compatible tools (Cursor, Claude, Copilot, OpenClaw)
- CTA: Add Beepack to your AI setup

---

## Technical SEO Checklist

- [x] `<meta charset="UTF-8">` on all pages
- [x] `<meta name="viewport">` on all pages
- [ ] Add `<link rel="canonical">` to all pages
- [ ] Add Open Graph tags to all pages
- [ ] Add Twitter Card tags to all pages
- [ ] Add `robots.txt` at root
- [ ] Add `sitemap.xml` at root
- [ ] Add structured data (JSON-LD `SoftwareApplication`) to homepage
- [ ] Ensure all `<img>` tags have descriptive `alt` attributes
- [ ] Add `<meta name="keywords">` to homepage and landing pages
- [ ] Verify page load speed (compress images, defer non-critical JS)

---

## robots.txt

```
User-agent: *
Allow: /

Sitemap: https://beepack.ai/sitemap.xml
```

## sitemap.xml (static pages)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://beepack.ai/</loc><priority>1.0</priority></url>
  <url><loc>https://beepack.ai/search.html</loc><priority>0.8</priority></url>
  <url><loc>https://beepack.ai/docs/</loc><priority>0.7</priority></url>
  <url><loc>https://beepack.ai/use-cases/api-integration-library.html</loc><priority>0.9</priority></url>
  <url><loc>https://beepack.ai/use-cases/reusable-code-registry.html</loc><priority>0.9</priority></url>
  <url><loc>https://beepack.ai/use-cases/vibecoding-tools.html</loc><priority>0.9</priority></url>
</urlset>
```

---

## Content Strategy (next steps)

1. **Blog posts** targeting long-tail keywords:
   - "How to add GitHub OAuth in 5 minutes with Beepack"
   - "Why vibe coders need a code registry, not just an LLM"
   - "The 10 most common API integrations AIs get wrong"

2. **Package pages as SEO assets**: Each package page at `/package.html?pkg={slug}` should be pre-rendered or server-side rendered with proper `<title>` and `<meta description>` for indexing.

3. **Link building**:
   - Submit to directories: AlternativeTo, Product Hunt, Hacker News
   - List in "awesome-vibecoding" and similar GitHub lists
   - Outreach to AI coding tool blogs

---

## Priority Actions (immediate)

1. Update `index.html` meta tags (title, description, OG, Twitter Card, canonical, keywords)
2. Update `search.html` meta tags
3. Create 3 landing pages under `/use-cases/`
4. Add `robots.txt` and `sitemap.xml` to `/site/`
5. Add structured data JSON-LD to homepage
