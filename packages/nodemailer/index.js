// Nodemailer — Integration helper for beepack
// Points to the real package: https://github.com/nodemailer/nodemailer
// Send e-mails with Node.js — easy as cake! The standard for sending emails. Supports SMTP, OAuth2, attachments, and more.

/**
 * Send Email Smtp — see https://github.com/nodemailer/nodemailer for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function send_email_smtp(config) {
  // This is a reference integration pointing to nodemailer/nodemailer.
  // For production usage, install the real package and follow the official docs.
  throw new Error("send_email_smtp requires the real Nodemailer package. Install from: https://github.com/nodemailer/nodemailer");
}
/**
 * Oauth2 Auth — see https://github.com/nodemailer/nodemailer for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function oauth2_auth(config) {
  // This is a reference integration pointing to nodemailer/nodemailer.
  // For production usage, install the real package and follow the official docs.
  throw new Error("oauth2_auth requires the real Nodemailer package. Install from: https://github.com/nodemailer/nodemailer");
}
/**
 * Attachments — see https://github.com/nodemailer/nodemailer for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function attachments(config) {
  // This is a reference integration pointing to nodemailer/nodemailer.
  // For production usage, install the real package and follow the official docs.
  throw new Error("attachments requires the real Nodemailer package. Install from: https://github.com/nodemailer/nodemailer");
}
/**
 * Html Email — see https://github.com/nodemailer/nodemailer for full documentation.
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Result
 */
export async function html_email(config) {
  // This is a reference integration pointing to nodemailer/nodemailer.
  // For production usage, install the real package and follow the official docs.
  throw new Error("html_email requires the real Nodemailer package. Install from: https://github.com/nodemailer/nodemailer");
}

/**
 * Get setup instructions for Nodemailer.
 * @returns {string} Installation and configuration guide
 */
export function getSetupGuide() {
  return `# Nodemailer Setup

## Installation
See https://github.com/nodemailer/nodemailer for installation instructions.

## Environment Variables
- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_PASS

## Quick Start
Visit https://github.com/nodemailer/nodemailer#readme for the official quick start guide.
`;
}
