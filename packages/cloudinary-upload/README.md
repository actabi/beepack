# Cloudinary Image Upload

Zero-dependency Cloudinary API client. Upload, transform, and manage images and videos.

## Prerequisites

- Node.js >= 18
- Cloudinary account

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`CLOUDINARY_CLOUD_NAME\` | Cloud name |
| \`CLOUDINARY_API_KEY\` | API key |
| \`CLOUDINARY_API_SECRET\` | API secret |

## Usage

### Upload an Image

\`\`\`js
import { upload } from './index.js';

const config = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};

const result = await upload(config, "https://example.com/photo.jpg", {
  folder: "avatars",
  publicId: "user-123"
});
console.log(result.secure_url);
\`\`\`

### Generate Transform URL

\`\`\`js
import { transformUrl } from './index.js';

const url = transformUrl("my-cloud", "avatars/user-123", {
  width: 200, height: 200, crop: "fill", gravity: "face", quality: "auto"
});
\`\`\`

### Delete an Asset

\`\`\`js
import { destroy } from './index.js';
await destroy(config, "avatars/user-123");
\`\`\`

## Source

Based on [cloudinary/cloudinary_npm](https://github.com/cloudinary/cloudinary_npm) by **Cloudinary** — 662+ stars on GitHub.