// S3-Compatible Storage Client (AWS S3, Cloudflare R2, MinIO)
// Zero dependencies - implements AWS Signature V4 using Web Crypto API.
// This is the hard part that takes forever to get right - proper signing with all the edge cases.

const TIMEOUT_MS = 30000;

/**
 * Create an S3 client instance.
 *
 * @param {object} config
 * @param {string} config.accessKeyId - AWS access key ID
 * @param {string} config.secretAccessKey - AWS secret access key
 * @param {string} config.bucket - Bucket name
 * @param {string} [config.region="us-east-1"] - AWS region
 * @param {string} [config.endpoint] - Custom endpoint (for R2, MinIO, etc.)
 * @returns {object} S3 client with upload, download, remove, list, presignedUrl methods
 */
export function createS3Client(config) {
  const {
    accessKeyId,
    secretAccessKey,
    bucket,
    region = "us-east-1",
    endpoint,
  } = config;

  const host = endpoint
    ? new URL(endpoint).host
    : `${bucket}.s3.${region}.amazonaws.com`;

  const baseUrl = endpoint
    ? `${endpoint}/${bucket}`
    : `https://${bucket}.s3.${region}.amazonaws.com`;

  async function signRequest(method, path, headers, payloadHash) {
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const shortDate = dateStamp.slice(0, 8);

    headers["x-amz-date"] = dateStamp;
    headers["x-amz-content-sha256"] = payloadHash;
    headers["host"] = host;

    const signedHeaderKeys = Object.keys(headers)
      .map((k) => k.toLowerCase())
      .sort();
    const signedHeaders = signedHeaderKeys.join(";");
    const canonicalHeaders = signedHeaderKeys
      .map((k) => `${k}:${headers[k.charAt(0).toUpperCase() + k.slice(1)] || headers[k]}`)
      .join("\n") + "\n";

    // Rebuild with lowercase keys for canonical request
    const headerMap = {};
    for (const k of Object.keys(headers)) headerMap[k.toLowerCase()] = headers[k];
    const sortedKeys = Object.keys(headerMap).sort();
    const canonHeaders = sortedKeys.map((k) => `${k}:${headerMap[k]}`).join("\n") + "\n";
    const signedH = sortedKeys.join(";");

    const canonicalRequest = [
      method,
      "/" + path,
      "",
      canonHeaders,
      signedH,
      payloadHash,
    ].join("\n");

    const scope = `${shortDate}/${region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      dateStamp,
      scope,
      await sha256Hex(canonicalRequest),
    ].join("\n");

    const dateKey = await hmac(`AWS4${secretAccessKey}`, shortDate);
    const regionKey = await hmac(dateKey, region);
    const serviceKey = await hmac(regionKey, "s3");
    const signingKey = await hmac(serviceKey, "aws4_request");
    const signature = await hmacHex(signingKey, stringToSign);

    headers["Authorization"] =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedH}, Signature=${signature}`;

    return headers;
  }

  return {
    /**
     * Upload a file to S3.
     * @param {string} key - Object key (path in bucket)
     * @param {Buffer|Uint8Array|string} body - File content
     * @param {string} [contentType="application/octet-stream"] - MIME type
     * @returns {Promise<{key: string, url: string}|null>}
     */
    async upload(key, body, contentType = "application/octet-stream") {
      try {
        const bodyBytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
        const payloadHash = await sha256Hex(bodyBytes);
        const headers = { "Content-Type": contentType };
        await signRequest("PUT", key, headers, payloadHash);

        const res = await fetch(`${baseUrl}/${key}`, {
          method: "PUT",
          headers,
          body: bodyBytes,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!res.ok) {
          console.error(`[s3-storage] Upload error ${res.status}: ${await res.text().catch(() => "")}`);
          return null;
        }
        return { key, url: `${baseUrl}/${key}` };
      } catch (err) {
        console.error(`[s3-storage] Upload failed: ${err.message}`);
        return null;
      }
    },

    /**
     * Download a file from S3.
     * @param {string} key - Object key
     * @returns {Promise<{body: ArrayBuffer, contentType: string}|null>}
     */
    async download(key) {
      try {
        const payloadHash = await sha256Hex("");
        const headers = {};
        await signRequest("GET", key, headers, payloadHash);

        const res = await fetch(`${baseUrl}/${key}`, {
          headers,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!res.ok) return null;
        return {
          body: await res.arrayBuffer(),
          contentType: res.headers.get("content-type") || "application/octet-stream",
        };
      } catch (err) {
        console.error(`[s3-storage] Download failed: ${err.message}`);
        return null;
      }
    },

    /**
     * Delete a file from S3.
     * @param {string} key - Object key
     * @returns {Promise<boolean>}
     */
    async remove(key) {
      try {
        const payloadHash = await sha256Hex("");
        const headers = {};
        await signRequest("DELETE", key, headers, payloadHash);

        const res = await fetch(`${baseUrl}/${key}`, {
          method: "DELETE",
          headers,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return res.ok || res.status === 204;
      } catch (err) {
        console.error(`[s3-storage] Delete failed: ${err.message}`);
        return false;
      }
    },

    /**
     * List objects in a prefix.
     * @param {string} [prefix=""] - Key prefix to filter
     * @param {number} [maxKeys=1000] - Max results
     * @returns {Promise<Array<{key: string, size: number, lastModified: string}>|null>}
     */
    async list(prefix = "", maxKeys = 1000) {
      try {
        const queryPath = `?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=${maxKeys}`;
        const payloadHash = await sha256Hex("");
        const headers = {};
        await signRequest("GET", "", headers, payloadHash);

        const res = await fetch(`${baseUrl}/${queryPath}`, {
          headers,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!res.ok) return null;
        const xml = await res.text();

        // Simple XML parsing for S3 ListObjectsV2 response
        const items = [];
        const regex = /<Contents>[\s\S]*?<Key>(.*?)<\/Key>[\s\S]*?<Size>(.*?)<\/Size>[\s\S]*?<LastModified>(.*?)<\/LastModified>[\s\S]*?<\/Contents>/g;
        let match;
        while ((match = regex.exec(xml)) !== null) {
          items.push({ key: match[1], size: parseInt(match[2], 10), lastModified: match[3] });
        }
        return items;
      } catch (err) {
        console.error(`[s3-storage] List failed: ${err.message}`);
        return null;
      }
    },

    /**
     * Generate a presigned URL for temporary access (GET only).
     * @param {string} key - Object key
     * @param {number} [expiresInSec=3600] - URL validity in seconds (max 7 days)
     * @returns {Promise<string|null>}
     */
    async presignedUrl(key, expiresInSec = 3600) {
      try {
        const now = new Date();
        const dateStamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
        const shortDate = dateStamp.slice(0, 8);
        const scope = `${shortDate}/${region}/s3/aws4_request`;
        const credential = `${accessKeyId}/${scope}`;

        const queryParams = new URLSearchParams({
          "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
          "X-Amz-Credential": credential,
          "X-Amz-Date": dateStamp,
          "X-Amz-Expires": String(expiresInSec),
          "X-Amz-SignedHeaders": "host",
        });

        const canonicalRequest = [
          "GET",
          "/" + key,
          queryParams.toString(),
          `host:${host}\n`,
          "host",
          "UNSIGNED-PAYLOAD",
        ].join("\n");

        const stringToSign = [
          "AWS4-HMAC-SHA256",
          dateStamp,
          scope,
          await sha256Hex(canonicalRequest),
        ].join("\n");

        const dateKey = await hmac(`AWS4${secretAccessKey}`, shortDate);
        const regionKey = await hmac(dateKey, region);
        const serviceKey = await hmac(regionKey, "s3");
        const signingKey = await hmac(serviceKey, "aws4_request");
        const signature = await hmacHex(signingKey, stringToSign);

        queryParams.set("X-Amz-Signature", signature);
        return `${baseUrl}/${key}?${queryParams.toString()}`;
      } catch (err) {
        console.error(`[s3-storage] Presign failed: ${err.message}`);
        return null;
      }
    },
  };
}

// --- Crypto helpers (Web Crypto API) ---

async function sha256Hex(data) {
  const encoded = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key, data) {
  const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const dataBytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, dataBytes);
  return new Uint8Array(sig);
}

async function hmacHex(key, data) {
  const sig = await hmac(key, data);
  return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
}
