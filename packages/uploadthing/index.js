// UploadThing — Integration helper for beepack
// Points to the real package: https://github.com/pingdotgg/uploadthing
// File uploads for modern web devs. Typesafe, simple file upload solution for Next.js and React applications.

/**
 * File Upload — see https://github.com/pingdotgg/uploadthing for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function file_upload(config) {
  // This is a reference integration pointing to pingdotgg/uploadthing.
  // For production usage, install the real package and follow the official docs.
  throw new Error("file_upload requires the real UploadThing package. Install from: https://github.com/pingdotgg/uploadthing");
}
/**
 * Image Upload — see https://github.com/pingdotgg/uploadthing for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function image_upload(config) {
  // This is a reference integration pointing to pingdotgg/uploadthing.
  // For production usage, install the real package and follow the official docs.
  throw new Error("image_upload requires the real UploadThing package. Install from: https://github.com/pingdotgg/uploadthing");
}
/**
 * File Validation — see https://github.com/pingdotgg/uploadthing for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function file_validation(config) {
  // This is a reference integration pointing to pingdotgg/uploadthing.
  // For production usage, install the real package and follow the official docs.
  throw new Error("file_validation requires the real UploadThing package. Install from: https://github.com/pingdotgg/uploadthing");
}
/**
 * Presigned Urls — see https://github.com/pingdotgg/uploadthing for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function presigned_urls(config) {
  // This is a reference integration pointing to pingdotgg/uploadthing.
  // For production usage, install the real package and follow the official docs.
  throw new Error("presigned_urls requires the real UploadThing package. Install from: https://github.com/pingdotgg/uploadthing");
}

/**
 * Get setup instructions for UploadThing.
 * @returns {string} Installation and configuration guide
 */
export function getSetupGuide() {
  return `# UploadThing Setup

## Installation
See https://github.com/pingdotgg/uploadthing for installation instructions.

## Environment Variables
- UPLOADTHING_SECRET
- UPLOADTHING_APP_ID

## Quick Start
Visit https://github.com/pingdotgg/uploadthing#readme for the official quick start guide.
`;
}
