// AWS SDK v3 (S3 Client) — Integration helper for beepack
// Points to the real package: https://github.com/aws/aws-sdk-js-v3
// Modularized AWS SDK for JavaScript. The @aws-sdk/client-s3 module is the standard for S3-compatible storage (AWS, MinIO, R2, etc.).

/**
 * S3 Upload — see https://github.com/aws/aws-sdk-js-v3 for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function s3_upload(config) {
  // This is a reference integration pointing to aws/aws-sdk-js-v3.
  // For production usage, install the real package and follow the official docs.
  throw new Error("s3_upload requires the real AWS SDK v3 (S3 Client) package. Install from: https://github.com/aws/aws-sdk-js-v3");
}
/**
 * S3 Download — see https://github.com/aws/aws-sdk-js-v3 for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function s3_download(config) {
  // This is a reference integration pointing to aws/aws-sdk-js-v3.
  // For production usage, install the real package and follow the official docs.
  throw new Error("s3_download requires the real AWS SDK v3 (S3 Client) package. Install from: https://github.com/aws/aws-sdk-js-v3");
}
/**
 * S3 List — see https://github.com/aws/aws-sdk-js-v3 for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function s3_list(config) {
  // This is a reference integration pointing to aws/aws-sdk-js-v3.
  // For production usage, install the real package and follow the official docs.
  throw new Error("s3_list requires the real AWS SDK v3 (S3 Client) package. Install from: https://github.com/aws/aws-sdk-js-v3");
}
/**
 * S3 Delete — see https://github.com/aws/aws-sdk-js-v3 for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function s3_delete(config) {
  // This is a reference integration pointing to aws/aws-sdk-js-v3.
  // For production usage, install the real package and follow the official docs.
  throw new Error("s3_delete requires the real AWS SDK v3 (S3 Client) package. Install from: https://github.com/aws/aws-sdk-js-v3");
}

/**
 * Get setup instructions for AWS SDK v3 (S3 Client).
 * @returns {string} Installation and configuration guide
 */
export function getSetupGuide() {
  return `# AWS SDK v3 (S3 Client) Setup

## Installation
See https://github.com/aws/aws-sdk-js-v3 for installation instructions.

## Environment Variables
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_REGION
- S3_BUCKET

## Quick Start
Visit https://github.com/aws/aws-sdk-js-v3#readme for the official quick start guide.
`;
}
