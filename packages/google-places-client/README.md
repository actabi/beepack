# google-places-client

Search the Google Places API (New) for business ratings, reviews, and contact info. Returns structured data for all matching establishments with weighted average ratings.

Zero dependencies - uses native `fetch`.

## Setup

Set the `GOOGLE_PLACES_API_KEY` environment variable. You need a Google Cloud project with the **Places API (New)** enabled.

## Usage

```js
import { fetchGooglePlacesData } from "./index.js";

const apiKey = process.env.GOOGLE_PLACES_API_KEY;

// Basic search
const result = await fetchGooglePlacesData(apiKey, "Boulangerie Dupont");

// Search with city (recommended for common names)
const result2 = await fetchGooglePlacesData(apiKey, "Cabinet Martin", {
  city: "Lyon",
});

// Custom options
const result3 = await fetchGooglePlacesData(apiKey, "Pizzeria Roma", {
  city: "Paris",
  languageCode: "en",
  regionCode: "FR",
  timeoutMs: 10000,
  maxEstablishments: 5,
});
```

## Response shape

When a match is found:

```js
{
  found: true,
  placeId: "ChIJ...",
  rating: 4.3,              // weighted average across establishments
  userRatingCount: 847,     // total reviews across establishments
  displayName: "Boulangerie Dupont",
  formattedAddress: "12 Rue de Rivoli, 75001 Paris, France",
  websiteUri: "https://example.com",
  establishments: [ ... ],  // present when multiple matches (2+)
  establishmentCount: 3,
  source: "google-places-api",
  fetchedAt: "2026-03-27T10:00:00.000Z"
}
```

When no match is found:

```js
{
  found: false,
  source: "google-places-api",
  fetchedAt: "2026-03-27T10:00:00.000Z"
}
```

Returns `null` on API errors or network failures - never throws.

## Aggregate helper

The `computeAggregate` function is exported separately if you need to recalculate weighted ratings on your own data:

```js
import { computeAggregate } from "./index.js";

const { avgRating, totalCount } = computeAggregate([
  { rating: 4.5, userRatingCount: 200 },
  { rating: 3.8, userRatingCount: 50 },
]);
// avgRating: 4.4, totalCount: 250
```

## API cost

Each `searchText` call costs approximately $0.032 (~0.03 EUR).
