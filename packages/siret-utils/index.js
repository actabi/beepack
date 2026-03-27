/**
 * SIRET validation and formatting utilities.
 *
 * SIRET = 14-digit French business identifier (SIREN 9 digits + NIC 5 digits).
 * Validation uses the Luhn mod-10 algorithm.
 *
 * Known exception (not handled): La Poste establishments (SIREN 356000000)
 * use a different checksum rule (sum of digits must be multiple of 5).
 */

/**
 * Validate a 14-digit SIRET using the Luhn mod-10 algorithm.
 * Returns true if the checksum is valid.
 *
 * @param {string} siret - Raw 14-digit SIRET string.
 * @returns {boolean}
 */
export function validateSiretLuhn(siret) {
  if (!/^\d{14}$/.test(siret)) return false;

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let digit = parseInt(siret[i], 10);
    // Double digits at even positions (0-indexed from left)
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  return sum % 10 === 0;
}

/**
 * Format a raw digit string into the standard SIRET display format:
 * XXX XXX XXX XXXXX (3+3+3+5)
 *
 * @param {string} raw - Raw digit string (may contain non-digit characters).
 * @returns {string} Formatted SIRET.
 */
export function formatSiret(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 14);
  const parts = [];
  if (digits.length > 0) parts.push(digits.slice(0, 3));
  if (digits.length > 3) parts.push(digits.slice(3, 6));
  if (digits.length > 6) parts.push(digits.slice(6, 9));
  if (digits.length > 9) parts.push(digits.slice(9, 14));
  return parts.join(" ");
}

/**
 * Format a 9-digit SIREN into display format: XXX XXX XXX
 *
 * @param {string} raw - Raw digit string (may contain non-digit characters).
 * @returns {string} Formatted SIREN.
 */
export function formatSiren(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  const parts = [];
  if (digits.length > 0) parts.push(digits.slice(0, 3));
  if (digits.length > 3) parts.push(digits.slice(3, 6));
  if (digits.length > 6) parts.push(digits.slice(6, 9));
  return parts.join(" ");
}

/**
 * Strip all non-digit characters from a formatted SIRET string.
 *
 * @param {string} formatted - Formatted SIRET/SIREN string.
 * @returns {string} Digits only.
 */
export function stripSiretFormatting(formatted) {
  return formatted.replace(/\D/g, "");
}
