# mapbox-maps

Forward and reverse geocoding, turn-by-turn directions, static map image URL generation, GeoJSON helpers, and a React map config generator — all via Mapbox REST APIs. Zero dependencies, native fetch.

## Setup

```bash
MAPBOX_ACCESS_TOKEN=pk.eyJ1...  # Get yours at https://account.mapbox.com
```

A **public** token (`pk.`) is sufficient for geocoding, directions, and static images. Store it server-side if you want to keep it private; never commit it to source control.

## Usage

### Forward Geocode (address → coordinates)

```js
import { forwardGeocode } from "./index.js";

const results = await forwardGeocode(process.env.MAPBOX_ACCESS_TOKEN, "Eiffel Tower, Paris");
// [{ id, placeName, coordinates: [2.2945, 48.8582], relevance: 0.99, ... }]

// Narrow to a country and return only 1 result
const [hit] = await forwardGeocode(process.env.MAPBOX_ACCESS_TOKEN, "10 Downing Street", {
  country: "gb",
  limit: 1,
  types: ["address"],
});
console.log(hit.coordinates); // [lng, lat]
```

### Reverse Geocode (coordinates → address)

```js
import { reverseGeocode } from "./index.js";

const results = await reverseGeocode(process.env.MAPBOX_ACCESS_TOKEN, 2.3522, 48.8566);
// [{ placeName: "Paris, Île-de-France, France", ... }]

// Return the street address and neighbourhood
const places = await reverseGeocode(process.env.MAPBOX_ACCESS_TOKEN, -0.1276, 51.5074, {
  types: ["address", "neighborhood"],
  limit: 2,
  language: "en",
});
```

### Directions

```js
import { getDirections } from "./index.js";

const route = await getDirections(
  process.env.MAPBOX_ACCESS_TOKEN,
  [
    [2.3522, 48.8566],   // Paris (lng, lat)
    [4.8357, 45.7640],   // Lyon
  ],
  { profile: "driving-traffic" }
);

console.log(`${(route.distance / 1000).toFixed(0)} km, ${Math.round(route.duration / 60)} min`);
// route.steps → array of turn-by-turn instructions
// route.geometry → GeoJSON LineString for the path
```

Supported profiles: `driving-traffic` (default), `driving`, `walking`, `cycling`.

### Static Map Image URL

```js
import { buildStaticMapUrl } from "./index.js";

const url = buildStaticMapUrl(process.env.MAPBOX_ACCESS_TOKEN, {
  lng: 2.3522,
  lat: 48.8566,
  zoom: 12,
  width: 800,
  height: 500,
  style: "mapbox/satellite-streets-v12",
  retina: true,
  markers: [
    { lng: 2.3522, lat: 48.8566, label: "A", color: "#e74c3c", size: "l" },
  ],
});
// Use directly in an <img src={url} /> — no fetch needed
```

### GeoJSON Helpers

```js
import { makePointFeature, makeLineFeature, makeFeatureCollection, haversineDistance } from "./index.js";

const point = makePointFeature(2.3522, 48.8566, { name: "Paris" });
const line  = makeLineFeature([[2.35, 48.85], [4.83, 45.76]], { route: "Paris-Lyon" });
const collection = makeFeatureCollection([point, line]);

// Straight-line distance (Haversine)
const km = haversineDistance([2.3522, 48.8566], [4.8357, 45.7640]);
// ~392 km
```

### React Map Config (react-map-gl)

```js
import { buildMapConfig } from "./index.js";
import Map from "react-map-gl";

const config = buildMapConfig(process.env.MAPBOX_ACCESS_TOKEN, {
  lng: 2.3522,
  lat: 48.8566,
  zoom: 11,
  pitch: 45,
  style: "mapbox://styles/mapbox/dark-v11",
  cooperativeGestures: true,
});

// In your component:
<Map {...config} />
```

## Response Shape

### Geocoding result (both forward and reverse)

```js
{
  id: "address.123456",
  placeName: "Eiffel Tower, Paris, Île-de-France, France",
  coordinates: [2.2945, 48.8582],   // [lng, lat]
  bbox: [2.28, 48.84, 2.31, 48.87], // present for regions/places, undefined for points
  relevance: 0.99,                  // 0–1, higher is better
  properties: { accuracy: "point" },
  context: [                        // parent geographies
    { id: "place.Paris", text: "Paris" },
    { id: "country.France", text: "France" },
  ]
}
```

### Directions result

```js
{
  distance: 391400,   // metres
  duration: 13500,    // seconds
  geometry: { type: "LineString", coordinates: [...] },
  legs: [ ... ],      // raw Mapbox leg objects
  steps: [ ... ]      // flattened turn-by-turn steps across all legs
}
```

All functions return `null` on API errors or network failures — they never throw.

## Edge Cases

- **Empty geocoding results** — returns `[]` (empty array), not `null`. Check `results.length` before accessing `results[0]`.
- **Invalid coordinates** — `reverseGeocode` returns `null` and logs an error if `lng`/`lat` are out of range or non-numeric, avoiding a wasted API call.
- **No route found** — `getDirections` returns `null` when Mapbox cannot route between the given waypoints (e.g. ferry-only connection with wrong profile).
- **Waypoint limits** — `getDirections` enforces the Mapbox cap of 25 waypoints and rejects early with `null`.
- **Static map markers** — `color` accepts both `#rrggbb` hex and bare hex strings (`e74c3c`); the `#` is stripped automatically.
- **Missing token** — every function checks for the token before making any network request and returns `null` immediately.
- **Timeout** — all requests use a 15 s `AbortSignal.timeout`; timed-out requests return `null` rather than hanging.
- **Retina images** — `buildStaticMapUrl` with `retina: true` appends `@2x` to the path; ensure your `width`/`height` are the CSS pixel dimensions (the API returns a 2× image).
