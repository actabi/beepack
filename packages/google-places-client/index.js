// Google Places API (New) - Text Search for business rating & review count
// Standalone Beepack package - uses native fetch, no external dependencies.

const API_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri";
const TIMEOUT_MS = 15_000;
const MAX_ESTABLISHMENTS = 10;

/**
 * Search Google Places API for a business by name and return rating data
 * for ALL matching establishments (up to 10).
 * Computes weighted average rating across all establishments.
 * Returns null on any error (missing key, network, no match) - never throws.
 *
 * @param {string} apiKey - Google Places API key
 * @param {string} companyName - Business name to search for
 * @param {object} [options]
 * @param {string|null} [options.city] - Optional city to refine the search
 * @param {string} [options.languageCode="fr"] - Language code for results
 * @param {string} [options.regionCode="FR"] - Region code bias
 * @param {number} [options.timeoutMs=15000] - Request timeout in milliseconds
 * @param {number} [options.maxEstablishments=10] - Max establishments to return
 * @returns {Promise<object|null>} Places data or null on error
 */
export async function fetchGooglePlacesData(apiKey, companyName, options = {}) {
  const {
    city = null,
    languageCode = "fr",
    regionCode = "FR",
    timeoutMs = TIMEOUT_MS,
    maxEstablishments = MAX_ESTABLISHMENTS,
  } = options;

  try {
    // Include city when available - essential for person-named businesses (notaries, lawyers, etc.)
    const textQuery = city ? `${companyName} ${city}` : companyName;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery, languageCode, regionCode }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      console.warn(
        `[google-places] API error ${res.status}: ${await res.text().catch(() => "")}`
      );
      return null;
    }

    const data = await res.json();
    const places = data.places;

    if (!places || places.length === 0) {
      console.log(`[google-places] No match for "${companyName}"`);
      return {
        found: false,
        source: "google-places-api",
        fetchedAt: new Date().toISOString(),
      };
    }

    // Take up to maxEstablishments results
    const topPlaces = places.slice(0, maxEstablishments);

    // Build establishments array
    const establishments = topPlaces.map((p) => ({
      placeId: p.id,
      rating: p.rating,
      userRatingCount: p.userRatingCount,
      displayName: p.displayName?.text,
      formattedAddress: p.formattedAddress,
      websiteUri: p.websiteUri,
    }));

    // Compute weighted average rating and total review count
    const { avgRating, totalCount } = computeAggregate(establishments);

    // Primary establishment = first result
    const primary = topPlaces[0];

    return {
      found: true,
      placeId: primary.id,
      rating: avgRating ?? primary.rating,
      userRatingCount: totalCount > 0 ? totalCount : primary.userRatingCount,
      displayName: primary.displayName?.text,
      formattedAddress: primary.formattedAddress,
      websiteUri: primary.websiteUri,
      establishments: establishments.length > 1 ? establishments : undefined,
      establishmentCount: establishments.length,
      source: "google-places-api",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[google-places] Fetch failed: ${msg}`);
    return null;
  }
}

/**
 * Weighted average: sum(rating_i * count_i) / sum(count_i)
 * Only establishments with both rating AND userRatingCount contribute.
 *
 * @param {Array<{rating?: number, userRatingCount?: number}>} establishments
 * @returns {{ avgRating: number|undefined, totalCount: number }}
 */
export function computeAggregate(establishments) {
  let weightedSum = 0;
  let totalCount = 0;

  for (const e of establishments) {
    if (e.rating != null && e.userRatingCount != null && e.userRatingCount > 0) {
      weightedSum += e.rating * e.userRatingCount;
      totalCount += e.userRatingCount;
    }
  }

  if (totalCount === 0) return { avgRating: undefined, totalCount: 0 };

  // Round to 1 decimal
  const avgRating = Math.round((weightedSum / totalCount) * 10) / 10;
  return { avgRating, totalCount };
}
