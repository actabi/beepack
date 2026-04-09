# Spotify Web API

Zero-dependency Spotify Web API client. Search tracks, get recommendations, manage playlists, and explore artists.

## Prerequisites

- Node.js >= 18
- Spotify Developer app (client ID + secret)

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`SPOTIFY_CLIENT_ID\` | Spotify app client ID |
| \`SPOTIFY_CLIENT_SECRET\` | Spotify app client secret |

## Usage

### Get Token & Search

\`\`\`js
import { getClientToken, search } from './index.js';

const token = await getClientToken(process.env.SPOTIFY_CLIENT_ID, process.env.SPOTIFY_CLIENT_SECRET);
const results = await search(token, "Daft Punk", "track,artist");
console.log(results.tracks.items.map(t => t.name));
\`\`\`

### Get Recommendations

\`\`\`js
import { getRecommendations } from './index.js';
const recs = await getRecommendations(token, {
  seed_genres: "electronic,dance",
  limit: 10
});
\`\`\`

### Artist Top Tracks

\`\`\`js
import { getArtistTopTracks } from './index.js';
const tracks = await getArtistTopTracks(token, "4tZwfgrHOc3mvqYlEYSvVi");
\`\`\`

## Source

Based on [Spotify Web API](https://github.com/spotify/web-api) documentation.