// Google Sheets API v4 - Zero dependencies
// Read, write, and manage spreadsheets.

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/**
 * Get an access token from a Google service account key.
 * @param {object} serviceAccountKey - Parsed JSON key
 * @returns {Promise<string>}
 */
export async function getAccessToken(serviceAccountKey) {
  const { client_email, private_key, token_uri } = serviceAccountKey;
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    iss: client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: token_uri || "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const { createSign } = await import("node:crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(header + "." + payload);
  const signature = sign.sign(private_key, "base64url");
  const jwt = header + "." + payload + "." + signature;
  const res = await fetch(token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || "Token failed");
  return data.access_token;
}

/**
 * Read values from a sheet range.
 * @param {string} token - Access token
 * @param {string} spreadsheetId
 * @param {string} range - e.g. "Sheet1!A1:D10"
 * @returns {Promise<string[][]>}
 */
export async function readRange(token, spreadsheetId, range) {
  const url = SHEETS_API + "/" + spreadsheetId + "/values/" + encodeURIComponent(range);
  const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) throw new Error("Sheets read " + res.status);
  const data = await res.json();
  return data.values || [];
}

/**
 * Write values to a sheet range.
 * @param {string} token
 * @param {string} spreadsheetId
 * @param {string} range
 * @param {string[][]} values - 2D array of cell values
 */
export async function writeRange(token, spreadsheetId, range, values) {
  const url = SHEETS_API + "/" + spreadsheetId + "/values/" + encodeURIComponent(range) + "?valueInputOption=USER_ENTERED";
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
  if (!res.ok) throw new Error("Sheets write " + res.status);
  return res.json();
}

/**
 * Append rows to a sheet.
 * @param {string} token
 * @param {string} spreadsheetId
 * @param {string} range - e.g. "Sheet1!A:D"
 * @param {string[][]} values
 */
export async function appendRows(token, spreadsheetId, range, values) {
  const url = SHEETS_API + "/" + spreadsheetId + "/values/" + encodeURIComponent(range) + ":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
  if (!res.ok) throw new Error("Sheets append " + res.status);
  return res.json();
}

/**
 * Create a new spreadsheet.
 * @param {string} token
 * @param {string} title
 * @returns {Promise<{spreadsheetId: string, spreadsheetUrl: string}>}
 */
export async function createSpreadsheet(token, title) {
  const res = await fetch(SHEETS_API, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { title } }),
  });
  if (!res.ok) throw new Error("Sheets create " + res.status);
  return res.json();
}