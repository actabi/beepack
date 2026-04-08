// Mapbox Maps & Geocoding - Forward/reverse geocoding, directions, static maps, GeoJSON helpers
// Zero dependencies - uses native fetch, ESM.

const GEOCODING_API = "https://api.mapbox.com/geocoding/v5";
const DIRECTIONS_API = "https://api.mapbox.com/directions/v5";
const STATIC_API = "https://api.mapbox.com/styles/v1";
const TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

/**
 * Forward geocode: convert a place name or address into coordinates.
 *
 * @param {string} token - Mapbox access token
 * @param {string} query - Address or place name to geocode
 * @param {object} [options]
 * @param {string} [options.country] - ISO 3166-1 alpha-2 country code to limit results (e.g. "fr")
 * @param {string} [options.language] - BCP 47 language code for results (e.g. "en", "fr")
 * @param {number} [options.limit=5] - Max results to return (1–10)
 * @param {[number,number]} [options.proximity] - [lng, lat] to bias results towards
 * @param {string[]} [options.types] - Feature types to return (e.g. ["place","address"])
 * @param {number} [options.timeoutMs=15000] - Request timeout in milliseconds
 * @returns {Promise<Array<{
 *   id: string,
 *   placeName: string,
 *   coordinates: [number, number],
 *   bbox: number[]|undefined,
 *   relevance: number,
 *   properties: object,
 *   context: object[]
 * }>|null>} Array of geocoding results or null on error
 */
export async function forwardGeocode(token, query, options = {}) {
  if (!token) {
    console.error("[mapbox-maps] forwardGeocode: missing access token");
    return null;
  }
  if (!query || !query.trim()) {
    console.error("[mapbox-maps] forwardGeocode: query must be a non-empty string");
    return null;
  }

  const { country, language, limit = 5, proximity, types, timeoutMs = TIMEOUT_MS } = options;

  const params = new URLSearchParams({ access_token: token, limit: String(limit) });
  if (country) params.set("country", country);
  if (language) params.set("language", language);
  if (proximity) params.set("proximity", proximity.join(","));
  if (types) params.set("types", types.join(","));

  const url = `${GEOCODING_API}/mapbox.places/${encodeURIComponent(query.trim())}.json?${params}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

    if (!res.ok) {
      console.error(`[mapbox-maps] forwardGeocode API error ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }

    const data = await res.json();
    if (!data.features || data.features.length === 0) return [];

    return data.features.map(_featureToResult);
  } catch (err) {
    console.error(`[mapbox-maps] forwardGeocode failed: ${err.message}`);
    return null;
  }
}

/**
 * Reverse geocode: convert coordinates into a human-readable address.
 *
 * @param {string} token - Mapbox access token
 * @param {number} lng - Longitude (-180 to 180)
 * @param {number} lat - Latitude (-90 to 90)
 * @param {object} [options]
 * @param {string} [options.language] - BCP 47 language code for results
 * @param {number} [options.limit=1] - Max results (1–10)
 * @param {string[]} [options.types] - Feature types to return (e.g. ["address","place"])
 * @param {number} [options.timeoutMs=15000] - Request timeout in milliseconds
 * @returns {Promise<Array<{
 *   id: string,
 *   placeName: string,
 *   coordinates: [number, number],
 *   bbox: number[]|undefined,
 *   relevance: number,
 *   properties: object,
 *   context: object[]
 * }>|null>} Array of geocoding results or null on error
 */
export async function reverseGeocode(token, lng, lat, options = {}) {
  if (!token) {
    console.error("[mapbox-maps] reverseGeocode: missing access token");
    return null;
  }
  if (typeof lng !== "number" || typeof lat !== "number") {
    console.error("[mapbox-maps] reverseGeocode: lng and lat must be numbers");
    return null;
  }
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    console.error(`[mapbox-maps] reverseGeocode: coordinates out of range (lng=${lng}, lat=${lat})`);
    return null;
  }

  const { language, limit = 1, types, timeoutMs = TIMEOUT_MS } = options;

  const params = new URLSearchParams({ access_token: token, limit: String(limit) });
  if (language) params.set("language", language);
  if (types) params.set("types", types.join(","));

  const url = `${GEOCODING_API}/mapbox.places/${lng},${lat}.json?${params}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

    if (!res.ok) {
      console.error(`[mapbox-maps] reverseGeocode API error ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }

    const data = await res.json();
    if (!data.features || data.features.length === 0) return [];

    return data.features.map(_featureToResult);
  } catch (err) {
    console.error(`[mapbox-maps] reverseGeocode failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Directions
// ---------------------------------------------------------------------------

/**
 * Get turn-by-turn directions between two or more waypoints.
 *
 * @param {string} token - Mapbox access token
 * @param {Array<[number, number]>} waypoints - Array of [lng, lat] pairs (2–25 points)
 * @param {object} [options]
 * @param {"driving-traffic"|"driving"|"walking"|"cycling"} [options.profile="driving-traffic"] - Routing profile
 * @param {boolean} [options.steps=true] - Include turn-by-turn steps
 * @param {boolean} [options.overview="full"] - Geometry overview ("full"|"simplified"|false)
 * @param {"geojson"|"polyline"|"polyline6"} [options.geometries="geojson"] - Geometry encoding
 * @param {"imperial"|"metric"} [options.voiceUnits="metric"] - Units for voice instructions
 * @param {number} [options.timeoutMs=15000] - Request timeout in milliseconds
 * @returns {Promise<{
 *   distance: number,
 *   duration: number,
 *   geometry: object,
 *   legs: object[],
 *   steps: object[]
 * }|null>} Best route or null on error
 */
export async function getDirections(token, waypoints, options = {}) {
  if (!token) {
    console.error("[mapbox-maps] getDirections: missing access token");
    return null;
  }
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    console.error("[mapbox-maps] getDirections: at least 2 waypoints required");
    return null;
  }
  if (waypoints.length > 25) {
    console.error("[mapbox-maps] getDirections: maximum 25 waypoints allowed");
    return null;
  }

  const {
    profile = "driving-traffic",
    steps = true,
    overview = "full",
    geometries = "geojson",
    voiceUnits = "metric",
    timeoutMs = TIMEOUT_MS,
  } = options;

  const coords = waypoints.map((w) => w.join(",")).join(";");
  const params = new URLSearchParams({
    access_token: token,
    steps: String(steps),
    overview,
    geometries,
    voice_units: voiceUnits,
  });

  const url = `${DIRECTIONS_API}/mapbox/${profile}/${coords}?${params}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

    if (!res.ok) {
      console.error(`[mapbox-maps] getDirections API error ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }

    const data = await res.json();

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      console.error(`[mapbox-maps] getDirections: no route found (code=${data.code}, message=${data.message ?? ""})`);
      return null;
    }

    const route = data.routes[0];
    return {
      distance: route.distance,   // metres
      duration: route.duration,   // seconds
      geometry: route.geometry,
      legs: route.legs,
      steps: route.legs.flatMap((leg) => leg.steps ?? []),
    };
  } catch (err) {
    console.error(`[mapbox-maps] getDirections failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Static Map Image URL Builder
// ---------------------------------------------------------------------------

/**
 * Build a Mapbox Static Images API URL for use in <img> tags or download.
 * No network request is made; the URL is constructed client- or server-side.
 *
 * @param {string} token - Mapbox access token
 * @param {object} options
 * @param {number} options.lng - Center longitude
 * @param {number} options.lat - Center latitude
 * @param {number} options.zoom - Zoom level (0–22)
 * @param {number} [options.width=600] - Image width in pixels (1–1280)
 * @param {number} [options.height=400] - Image height in pixels (1–1280)
 * @param {string} [options.style="mapbox/streets-v12"] - Style id (e.g. "mapbox/satellite-v9")
 * @param {boolean} [options.retina=false] - Request @2x retina image
 * @param {Array<{lng: number, lat: number, label?: string, color?: string, size?: "s"|"m"|"l"}>} [options.markers] - Pin markers to overlay
 * @param {string} [options.padding] - Padding inside the image (e.g. "50" or "50,25")
 * @returns {string|null} Static image URL or null if required params are missing
 */
export function buildStaticMapUrl(token, options = {}) {
  if (!token) {
    console.error("[mapbox-maps] buildStaticMapUrl: missing access token");
    return null;
  }

  const {
    lng,
    lat,
    zoom,
    width = 600,
    height = 400,
    style = "mapbox/streets-v12",
    retina = false,
    markers = [],
    padding,
  } = options;

  if (lng == null || lat == null || zoom == null) {
    console.error("[mapbox-maps] buildStaticMapUrl: lng, lat and zoom are required");
    return null;
  }

  const overlays = markers.map((m) => {
    const color = (m.color ?? "f84").replace(/^#/, "");
    const size = m.size ?? "m";
    const label = m.label ? `-${m.label}` : "";
    return `pin-${size}${label}+${color}(${m.lng},${m.lat})`;
  });

  const overlayPath = overlays.length > 0 ? `${overlays.join(",")}/` : "";
  const retinaPath = retina ? "@2x" : "";
  const paddingParam = padding ? `&padding=${padding}` : "";

  return (
    `${STATIC_API}/${style}/static/${overlayPath}` +
    `${lng},${lat},${zoom}/${width}x${height}${retinaPath}` +
    `?access_token=${token}${paddingParam}`
  );
}

// ---------------------------------------------------------------------------
// Place Search (alias for forwardGeocode with POI default types)
// ---------------------------------------------------------------------------

/**
 * Search for points of interest and named places matching a query string.
 * Convenience wrapper around forwardGeocode that defaults types to 'poi,place'.
 * Suitable for "search nearby" pickers and autocomplete UIs.
 *
 * @param {string} token - Mapbox access token
 * @param {string} query - Search query string
 * @param {object} [options={}] - Geocoding options (same as forwardGeocode)
 * @param {string} [options.types='poi,place'] - Feature types to include; override to narrow results
 * @param {number} [options.limit=5] - Maximum results (1-10)
 * @param {Array<number>} [options.proximity] - Bias results toward [lng, lat]
 * @param {string} [options.country] - ISO 3166-1 alpha-2 country restriction
 * @param {string} [options.language] - IETF language code for result text
 * @returns {Promise<Array<object>|null>} Normalized geocoding results or null on error
 */
export async function searchPlaces(token, query, options = {}) {
  const merged = { types: ['poi', 'place'], ...options };
  return forwardGeocode(token, query, merged);
}

// ---------------------------------------------------------------------------
// Static Map URL (named alias for buildStaticMapUrl with positional args)
// ---------------------------------------------------------------------------

/**
 * Build a Mapbox Static Images API URL without making a network request.
 * Positional-argument variant of buildStaticMapUrl for quick one-liner use.
 * The returned URL can be used directly as an <img> src.
 *
 * @param {string} token - Mapbox access token
 * @param {number} lon - Center longitude
 * @param {number} lat - Center latitude
 * @param {number} zoom - Zoom level (0-22)
 * @param {object} [options={}] - Display options
 * @param {number} [options.width=600] - Image width in pixels (1-1280)
 * @param {number} [options.height=400] - Image height in pixels (1-1280)
 * @param {string} [options.style='mapbox/streets-v12'] - Map style ID
 * @param {number} [options.bearing=0] - Map rotation in degrees (0-360)
 * @param {number} [options.pitch=0] - Map tilt in degrees (0-60)
 * @param {boolean} [options.retina=false] - Return @2x high-DPI image
 * @param {Array<{lng: number, lat: number, label?: string, color?: string, size?: string}>} [options.markers=[]]
 *   Overlay pin markers on the map
 * @returns {string|null} Static image URL string, or null if required params are missing
 */
export function staticMapUrl(token, lon, lat, zoom, options = {}) {
  return buildStaticMapUrl(token, { lng: lon, lat, zoom, ...options });
}

// ---------------------------------------------------------------------------
// Isochrone
// ---------------------------------------------------------------------------

/**
 * Query the Mapbox Isochrone API to get travel-time or travel-distance contour polygons.
 * Returns a GeoJSON FeatureCollection where each Feature is one contour.
 *
 * @param {string} token - Mapbox access token
 * @param {'driving'|'walking'|'cycling'} profile - Routing profile
 * @param {number} lon - Origin longitude
 * @param {number} lat - Origin latitude
 * @param {Array<{minutes?: number, meters?: number}>} contours - Contour definitions (max 4).
 *   Use minutes for time-based isochrones or meters for distance-based isochrones.
 *   Time range: 1-60 minutes. Distance range: 1-100000 meters.
 * @param {object} [options={}] - Display and computation options
 * @param {boolean} [options.polygons=true] - Return filled polygons (true) or LineStrings (false)
 * @param {Array<string>} [options.colors] - Hex colors without '#' for each contour band
 * @param {boolean} [options.denoise] - Remove small disconnected polygons when true
 * @param {number} [options.generalize] - Simplification tolerance in metres (reduces polygon complexity)
 * @param {number} [options.timeoutMs=15000] - Request timeout in milliseconds
 * @returns {Promise<object|null>} GeoJSON FeatureCollection or null on error
 */
export async function isochrone(token, profile, lon, lat, contours, options = {}) {
  if (!token || !profile || lon == null || lat == null || !Array.isArray(contours) || contours.length === 0) {
    console.error('[mapbox-maps] isochrone: token, profile, lon, lat, and contours array are required');
    return null;
  }
  if (contours.length > 4) {
    console.error('[mapbox-maps] isochrone: maximum 4 contours supported per request');
    return null;
  }

  const validProfiles = ['driving', 'walking', 'cycling'];
  if (!validProfiles.includes(profile)) {
    console.error(`[mapbox-maps] isochrone: invalid profile '${profile}'. Must be one of: ${validProfiles.join(', ')}`);
    return null;
  }

  const { polygons = true, colors, denoise, generalize, timeoutMs = TIMEOUT_MS } = options;

  const params = new URLSearchParams({
    access_token: token,
    polygons: String(polygons),
  });

  // Determine time-based or distance-based from first contour entry
  const useMinutes = contours[0].minutes !== undefined;
  if (useMinutes) {
    params.set('contours_minutes', contours.map((c) => c.minutes).join(','));
  } else {
    params.set('contours_meters', contours.map((c) => c.meters).join(','));
  }

  if (colors && colors.length > 0) {
    params.set('contours_colors', colors.slice(0, contours.length).map((c) => c.replace(/^#/, '')).join(','));
  }
  if (denoise !== undefined) params.set('denoise', String(denoise));
  if (generalize !== undefined) params.set('generalize', String(generalize));

  const url = `https://api.mapbox.com/isochrone/v1/mapbox/${profile}/${lon},${lat}?${params}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      console.error(`[mapbox-maps] isochrone API error ${res.status}: ${await res.text().catch(() => '')}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`[mapbox-maps] isochrone failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch Geocoding
// ---------------------------------------------------------------------------

/**
 * Geocode multiple addresses sequentially, with a 50ms delay between requests
 * to respect Mapbox's rate limits on the geocoding endpoint.
 * Returns the best match (first result) for each address, or null if no result was found.
 *
 * @param {string} token - Mapbox access token
 * @param {Array<string>} addresses - Array of address or place name strings to geocode
 * @param {object} [options={}] - Geocoding options applied to every request (see forwardGeocode)
 * @param {string} [options.country] - Country restriction (ISO 3166-1 alpha-2)
 * @param {string} [options.language] - Result language (IETF code)
 * @param {Array<string>} [options.types] - Feature type filter
 * @param {Array<number>} [options.proximity] - Proximity bias [lng, lat]
 * @returns {Promise<Array<object|null>>}
 *   Array of best-match geocoding results (or null for no-match addresses),
 *   same length and order as the input addresses array. Returns null on parameter error.
 */
export async function batchGeocode(token, addresses, options = {}) {
  if (!token || !Array.isArray(addresses)) {
    console.error('[mapbox-maps] batchGeocode: token and addresses array are required');
    return null;
  }

  const results = [];

  for (let i = 0; i < addresses.length; i++) {
    // Rate-limit pause between requests (skip before first request)
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const address = addresses[i];
    if (!address || typeof address !== 'string' || !address.trim()) {
      results.push(null);
      continue;
    }

    const matches = await forwardGeocode(token, address, { ...options, limit: 1 });
    results.push(matches && matches.length > 0 ? matches[0] : null);
  }

  return results;
}

// ---------------------------------------------------------------------------
// GeoJSON Helpers
// ---------------------------------------------------------------------------

/**
 * Create a GeoJSON Point feature from coordinates.
 *
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @param {object} [properties={}] - Feature properties
 * @returns {{ type: "Feature", geometry: object, properties: object }}
 */
export function makePointFeature(lng, lat, properties = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties,
  };
}

/**
 * Create a GeoJSON LineString feature from an array of coordinate pairs.
 *
 * @param {Array<[number, number]>} coordinates - Array of [lng, lat] pairs
 * @param {object} [properties={}] - Feature properties
 * @returns {{ type: "Feature", geometry: object, properties: object }}
 */
export function makeLineFeature(coordinates, properties = {}) {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties,
  };
}

/**
 * Wrap one or more features into a GeoJSON FeatureCollection.
 *
 * @param {object|object[]} features - Single feature or array of features
 * @returns {{ type: "FeatureCollection", features: object[] }}
 */
export function makeFeatureCollection(features) {
  return {
    type: "FeatureCollection",
    features: Array.isArray(features) ? features : [features],
  };
}

/**
 * Calculate the straight-line distance between two points using the
 * Haversine formula. Returns kilometres.
 *
 * @param {[number, number]} from - [lng, lat]
 * @param {[number, number]} to - [lng, lat]
 * @returns {number} Distance in kilometres
 */
export function haversineDistance(from, to) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(to[1] - from[1]);
  const dLng = toRad(to[0] - from[0]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from[1])) * Math.cos(toRad(to[1])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// React Map Initialization Config Generator
// ---------------------------------------------------------------------------

/**
 * Generate an initialViewState / mapStyle config object suitable for
 * react-map-gl (Mapbox GL JS wrapper). Pass the returned object directly
 * as props to the <Map> component.
 *
 * @param {string} token - Mapbox access token
 * @param {object} [options]
 * @param {number} [options.lng=2.3522] - Initial center longitude (default: Paris)
 * @param {number} [options.lat=48.8566] - Initial center latitude
 * @param {number} [options.zoom=12] - Initial zoom level
 * @param {number} [options.pitch=0] - Camera pitch (0–85°)
 * @param {number} [options.bearing=0] - Camera bearing (0–360°)
 * @param {string} [options.style="mapbox://styles/mapbox/streets-v12"] - Mapbox style URL
 * @param {boolean} [options.scrollZoom=true] - Enable scroll-wheel zoom
 * @param {boolean} [options.cooperativeGestures=false] - Require ctrl/cmd to zoom (mobile-friendly)
 * @returns {{ mapboxAccessToken: string, initialViewState: object, mapStyle: string, scrollZoom: boolean, cooperativeGestures: boolean }|null}
 */
export function buildMapConfig(token, options = {}) {
  if (!token) {
    console.error("[mapbox-maps] buildMapConfig: missing access token");
    return null;
  }

  const {
    lng = 2.3522,
    lat = 48.8566,
    zoom = 12,
    pitch = 0,
    bearing = 0,
    style = "mapbox://styles/mapbox/streets-v12",
    scrollZoom = true,
    cooperativeGestures = false,
  } = options;

  return {
    mapboxAccessToken: token,
    initialViewState: { longitude: lng, latitude: lat, zoom, pitch, bearing },
    mapStyle: style,
    scrollZoom,
    cooperativeGestures,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * @param {object} feature - Raw Mapbox GeoJSON feature
 * @returns {object} Normalised geocoding result
 */
function _featureToResult(feature) {
  return {
    id: feature.id,
    placeName: feature.place_name,
    coordinates: feature.geometry.coordinates, // [lng, lat]
    bbox: feature.bbox,
    relevance: feature.relevance,
    properties: feature.properties ?? {},
    context: feature.context ?? [],
  };
}
