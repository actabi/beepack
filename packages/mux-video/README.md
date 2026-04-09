# mux-video

Upload, manage, and stream video assets with the Mux Video API. Zero dependencies — uses native `fetch` with Basic auth.

Source: [muxinc/mux-node-sdk](https://github.com/muxinc/mux-node-sdk) (177+ stars)

## Setup

```bash
MUX_TOKEN_ID=your-token-id        # Mux access token ID
MUX_TOKEN_SECRET=your-secret      # Mux access token secret
```

## Usage

### Create Asset from URL

```js
import { createAsset } from "./index.js";

const asset = await createAsset(process.env.MUX_TOKEN_ID, process.env.MUX_TOKEN_SECRET, {
  url: "https://storage.example.com/my-video.mp4",
  playbackPolicy: "public",
  mp4Support: true,
});
// { id: "asset_abc", status: "preparing", playbackIds: [{ id: "play_xyz", policy: "public" }] }
// Stream URL: https://stream.mux.com/{playbackId}.m3u8
```

### Direct Upload (Client-Side)

```js
import { createUploadUrl } from "./index.js";

const upload = await createUploadUrl(process.env.MUX_TOKEN_ID, process.env.MUX_TOKEN_SECRET, {
  corsOrigin: "https://myapp.com",
});
// Give upload.url to the client for PUT upload
// upload.assetId is the resulting asset
```

### Get and List Assets

```js
import { getAsset, listAssets } from "./index.js";

const asset = await getAsset(process.env.MUX_TOKEN_ID, process.env.MUX_TOKEN_SECRET, "asset_abc");
// { id, status, duration, playbackIds, createdAt }

const assets = await listAssets(process.env.MUX_TOKEN_ID, process.env.MUX_TOKEN_SECRET, {
  limit: 10,
  page: 1,
});
```

### Add Playback ID

```js
import { createPlaybackId } from "./index.js";

const playback = await createPlaybackId(
  process.env.MUX_TOKEN_ID,
  process.env.MUX_TOKEN_SECRET,
  "asset_abc",
  "signed"
);
// { id: "play_new", policy: "signed" }
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MUX_TOKEN_ID` | Mux access token ID from dashboard |
| `MUX_TOKEN_SECRET` | Mux access token secret |
