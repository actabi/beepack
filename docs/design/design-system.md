# Beepack Design System

> Visual identity and component guidelines for Beepack — the battle-tested code registry.

---

## Brand Identity

**Beepack** is a developer tool for AI-assisted coding. The brand combines industrial reliability ("battle-tested") with the energy and speed of a bee. The visual language is clean, confident, and developer-friendly — not flashy, not playful. Amber/yellow is the signature color: it reads as warmth, energy, and caution (security), all relevant to the product.

**Brand voice:** Direct. Technical. Trustworthy. No filler.

---

## Color Palette

All colors are defined as CSS custom properties in `site/css/style.css`.

### Core Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | `#f59e0b` | CTAs, highlights, brand accents, step numbers |
| `--primary-dark` | `#d97706` | Hover state for primary buttons |
| `--secondary` | `#1f2937` | Dark sections (For AI section), code blocks |
| `--background` | `#ffffff` | Page background |
| `--background-alt` | `#f9fafb` | Section alternates, tag backgrounds, search section |
| `--text` | `#111827` | Body text, headings |
| `--text-muted` | `#6b7280` | Subtitles, metadata, secondary labels |
| `--border` | `#e5e7eb` | Card borders, dividers, input borders |
| `--success` | `#10b981` | Security pass, positive feedback, green badges |
| `--danger` | `#ef4444` | Security failures, errors, alerts |
| `--radius` | `8px` | Default border radius |
| `--shadow` | `0 1px 3px rgba(0,0,0,0.1)` | Card default shadow |
| `--shadow-lg` | `0 10px 25px rgba(0,0,0,0.1)` | Hover/elevated card shadow |

### Semantic Color Usage

| Situation | Color |
|-----------|-------|
| Primary action / CTA | `--primary` (#f59e0b) |
| Destructive / error | `--danger` (#ef4444) |
| Success / confirmed | `--success` (#10b981) |
| Disabled / inactive | `--text-muted` (#6b7280) |
| Code / terminal surfaces | `--secondary` (#1f2937) |

### Feature Icon Backgrounds

Light tinted circles for feature section icons:

| Class | Color |
|-------|-------|
| `.feature-icon-yellow` | `#fef3c7` (amber-50) |
| `.feature-icon-green` | `#d1fae5` (emerald-100) |
| `.feature-icon-blue` | `#dbeafe` (blue-100) |

---

## Typography

### Font Stack

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

**Inter** is the primary typeface. If unavailable, fall back to system sans-serif. Never use serif fonts in UI.

For code and terminals:

```css
font-family: 'Monaco', 'Menlo', monospace;
```

### Type Scale

| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| `h1` | 3.5rem (56px) | 700 | 1.1 |
| `h2` | 2rem (32px) | 600 | default |
| `h3` | 1.25rem (20px) | 600 | default |
| `h4` | 1rem (16px) | 600 | default |
| Body | inherit (~16px) | 400 | 1.6 |
| Hero subtitle | 1.25rem | 400 | default |
| Small / meta | 12–14px | 400–500 | default |
| Code | 13px | 400 | default |

### Responsive Typography

On mobile (`max-width: 768px`): `h1` reduces to `2.5rem`.

---

## Spacing

Base unit: **8px**.

| Scale | Value | Usage |
|-------|-------|-------|
| xs | 4px | Internal padding for tags, chips |
| sm | 8px | Gap between inline elements, icon+text |
| md | 12px | Card inner spacing, form gaps |
| lg | 16px | Section padding between grouped items |
| xl | 20–24px | Card padding |
| 2xl | 32px | Card padding (feature/step cards), grid gaps |
| 3xl | 40–48px | Section vertical padding (hero actions, subtitles) |
| 4xl | 64px | Header height |
| 5xl | 80px | Section vertical padding |

Container max-width: **1200px**, horizontal padding: **24px**.

---

## Layout

### Grid System

Use CSS Grid with `auto-fit` and `minmax` for fluid responsive layouts:

| Grid | Min Column | Gap |
|------|-----------|-----|
| Feature grid | 300px | 32px |
| Steps grid | 320px | 32px |
| Packages grid | 280px | 24px |
| AI integration | 400px | 32px |

### Breakpoints

| Breakpoint | Value |
|------------|-------|
| Mobile | ≤ 768px |

At mobile: nav is hidden, flex rows become columns, grids collapse to 1 column.

### Header

- Height: 64px
- Position: sticky, top 0, z-index 100
- Background: `rgba(255,255,255,0.95)` with `backdrop-filter: blur(10px)`
- Border-bottom: 1px solid `--border`

---

## Components

### Buttons

All buttons use `.btn` as the base class.

#### Variants

| Class | Background | Text | Border |
|-------|-----------|------|--------|
| `.btn-primary` | `--primary` | white | none |
| `.btn-primary:hover` | `--primary-dark` | white | none |
| `.btn-outline` | transparent | `--text` | 1px `--border` |
| `.btn-outline:hover` | `--background-alt` | `--text` | 1px `--border` |

#### Sizes

| Class | Padding | Font Size |
|-------|---------|-----------|
| default | 10px 20px | 14px |
| `.btn-lg` | 14px 28px | 16px |
| `.btn-sm` | 6px 12px | 13px |
| `.btn-icon` | 40×40px (fixed) | — |

#### Shared Properties

```css
display: inline-flex;
align-items: center;
justify-content: center;
gap: 8px;
border-radius: var(--radius); /* 8px */
font-weight: 500;
transition: all 0.2s;
```

---

### Cards

#### Package Card (`.package-card`)

```css
border: 1px solid var(--border);
border-radius: var(--radius);
padding: 24px;
transition: box-shadow 0.2s;
```

On hover: `box-shadow: var(--shadow-lg)`.

Placeholder variant (`.package-card-placeholder`): `border-style: dashed`, centered text.

#### Feature Card (`.feature-card`)

```css
text-align: center;
padding: 32px;
/* no border, no background — relies on section bg */
```

Contains a `.feature-icon` (64×64px circle) and text.

#### Step Card (`.step`)

```css
background: white;
padding: 32px;
border-radius: var(--radius);
box-shadow: var(--shadow);
```

Contains a `.step-number` (40×40px amber circle, white bold text) and content.

#### AI Card (`.ai-card`)

For use on dark (`--secondary`) backgrounds:

```css
background: rgba(255,255,255,0.05);
border: 1px solid rgba(255,255,255,0.1);
border-radius: var(--radius);
padding: 24px;
```

Card heading uses `--primary` color on dark background.

---

### Search Bar

```html
<div class="search-box">
  <input class="search-input" type="text" placeholder="..." />
  <button class="btn btn-primary">Search</button>
</div>
```

`.search-input`:

```css
flex: 1;
padding: 14px 20px;
border: 1px solid var(--border);
border-radius: var(--radius);
font-size: 16px;
outline: none;
```

Focus state:

```css
border-color: var(--primary);
box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
```

The search box is constrained to `max-width: 700px` and centered. On mobile, direction becomes column.

---

### Navigation

```html
<nav class="nav">
  <a href="/search.html">Browse</a>
  <a href="/docs">Docs</a>
  <a href="#">API</a>
</nav>
```

- Nav links: `color: --text-muted`, hover to `--text`, font-weight 500, 14px
- Gap: 32px between links
- Hidden on mobile (`display: none` at ≤768px)

---

### Tags & Badges

`.tag`:

```css
background: var(--background-alt);
color: var(--text-muted);
padding: 2px 8px;
border-radius: 4px;
font-size: 11px;
```

`.package-version`:

```css
background: var(--background-alt);
padding: 2px 8px;
border-radius: 4px;
```

---

### Code Blocks

Light surfaces (inside `.step`):

```css
background: var(--secondary); /* #1f2937 */
color: #e5e7eb;
padding: 16px;
border-radius: var(--radius);
font-size: 13px;
font-family: 'Monaco', 'Menlo', monospace;
overflow-x: auto;
```

Dark surfaces (inside `.ai-card`):

```css
background: rgba(0,0,0,0.3);
padding: 16px;
border-radius: var(--radius);
font-size: 13px;
```

---

### Logo

The logo lives in `.logo` (flexbox, gap 8px):

- `.logo-icon`: 24px (emoji or icon)
- `.logo-text`: 20px, font-weight 700
- `.logo-bee`: 20px (bee emoji)

---

## Iconography

Beepack uses **emoji as icons** throughout the UI (no icon library dependency). This is intentional: it keeps the bundle light and feels friendly without being cartoonish.

| Context | Emoji examples |
|---------|---------------|
| Feature icons | 🔐 🔄 ⚡ |
| Package types | 🧩 📄 🔑 |
| Stats | ⭐ 📦 🐝 |
| Steps | Numbered circles (amber bg) |

Use emoji consistently at the documented sizes. Do not mix emoji and SVG icons in the same component.

---

## Animation

### Bee Bounce (`.bee-emoji`)

```css
animation: bounce 1s infinite;

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-5px); }
}
```

Used sparingly on the hero section bee emoji only.

### Transitions

- Buttons: `transition: all 0.2s`
- Cards: `transition: box-shadow 0.2s`
- Nav links: `transition: color 0.2s`

Keep transitions at **0.2s ease** unless there is a strong reason to deviate.

---

## Accessibility

### Color Contrast

| Pair | Ratio | Passes |
|------|-------|--------|
| `#111827` on `#ffffff` | ~16:1 | AAA |
| `#6b7280` on `#ffffff` | ~4.6:1 | AA |
| `white` on `#f59e0b` | ~2.6:1 | ⚠ Large text only |
| `white` on `#d97706` | ~3.1:1 | ⚠ Large text only |
| `#e5e7eb` on `#1f2937` | ~9.6:1 | AAA |

> **Note:** White text on amber (`--primary`) does not meet AA for small text. Use dark text (`--text`) on amber backgrounds for body/label text, or use amber only for large text/decorative elements. The current `.btn-primary` uses white text — acceptable since it is large enough (14px+, bold).

### Focus Management

- All interactive elements must have visible focus styles.
- `search-input:focus` already provides a visible amber ring: `box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1)`. Apply the same pattern to all focusable inputs and buttons.
- Never remove `outline` without providing an equivalent visual indicator.

### Semantic HTML

- Use `<nav>` for site navigation.
- Use `<main>` to wrap the primary page content.
- Use `<section>` with descriptive headings for content regions.
- Use `<button>` for actions, `<a>` for navigation. Never reverse this.
- All images must have meaningful `alt` attributes; decorative images use `alt=""`.

### Keyboard Navigation

- Navigation must be fully operable via keyboard.
- Modals and dropdowns must trap focus when open and restore focus on close.
- Tab order should follow visual reading order.

### ARIA

- Buttons without visible text (`.btn-icon`) must have `aria-label`.
- Loading states should use `aria-busy="true"` and `aria-live` regions for updates.
- Search input should be associated with its label via `aria-label` or `<label for>`.

---

## Dark Mode (Future)

The design system is light-mode only. A future dark mode should:

- Invert `--background` / `--text` pairs
- Darken `--background-alt` to a near-black surface
- Keep `--primary` amber unchanged (it reads well on dark)
- Swap `--border` to a lighter-opacity white border

Implement via `prefers-color-scheme` media query or a `.dark` class on `<html>`.

---

## File Reference

| File | Purpose |
|------|---------|
| `site/css/style.css` | Main stylesheet — tokens, layout, all components |
| `site/css/docs.css` | Documentation section overrides |
| `site/index.html` | Homepage — reference implementation |
| `site/search.html` | Search/browse page |
| `site/package.html` | Package detail page |
| `site/img/logo.png` | Logo asset |
| `site/img/mascot.png` | Mascot/bee asset |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-08 | Initial design system documented from existing site implementation |
