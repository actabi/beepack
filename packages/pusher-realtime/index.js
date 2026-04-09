// pusher-realtime – zero-dependency server-side Pusher HTTP API wrapper
// https://github.com/pusher/pusher-js

import { createHmac } from 'node:crypto';

const APP_ID = process.env.PUSHER_APP_ID;
const KEY = process.env.PUSHER_KEY;
const SECRET = process.env.PUSHER_SECRET;
const CLUSTER = process.env.PUSHER_CLUSTER;

/**
 * Build the base URL for the Pusher HTTP API.
 * @returns {string}
 */
function baseUrl() {
  return `https://api-${CLUSTER}.pusher.com/apps/${APP_ID}`;
}

/**
 * Generate an HMAC-SHA256 authentication signature for a Pusher request.
 * @param {string} method - HTTP method (GET or POST)
 * @param {string} path - Request path (e.g. /apps/{appId}/events)
 * @param {Record<string, string>} params - Query parameters (excluding auth_signature)
 * @param {string} [body] - Request body for POST requests
 * @returns {string} Hex-encoded HMAC-SHA256 signature
 */
function sign(method, path, params, body) {
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const stringToSign = [method.toUpperCase(), path, sortedParams].join('\n');
  return createHmac('sha256', SECRET).update(stringToSign).digest('hex');
}

/**
 * Build authenticated query parameters for a Pusher API request.
 * @param {string} method - HTTP method
 * @param {string} path - API path
 * @param {string} [bodyMd5] - MD5 hex digest of the request body
 * @returns {URLSearchParams}
 */
function authParams(method, path, bodyMd5) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = {
    auth_key: KEY,
    auth_timestamp: timestamp,
    auth_version: '1.0',
  };
  if (bodyMd5) params.body_md5 = bodyMd5;
  const signature = sign(method, path, params);
  params.auth_signature = signature;
  return new URLSearchParams(params);
}

/**
 * Compute MD5 hex digest of a string.
 * @param {string} str
 * @returns {string}
 */
function md5(str) {
  return createHmac('md5', '').update(str).digest('hex');
}

/**
 * Internal helper – make an authenticated request to the Pusher HTTP API.
 * @param {string} method - HTTP method
 * @param {string} pathSuffix - Path after /apps/{appId}
 * @param {string} [body] - JSON body string
 * @returns {Promise<any|null>}
 */
async function request(method, pathSuffix, body) {
  if (!APP_ID || !KEY || !SECRET || !CLUSTER) {
    throw new Error('PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, and PUSHER_CLUSTER must be set');
  }
  const path = `/apps/${APP_ID}${pathSuffix}`;
  const bodyMd5 = body ? md5(body) : undefined;
  const qs = authParams(method, path, bodyMd5);
  const url = `${baseUrl()}${pathSuffix}?${qs.toString()}`;
  try {
    const opts = { method, signal: AbortSignal.timeout(15000) };
    if (body) {
      opts.body = body;
      opts.headers = { 'Content-Type': 'application/json' };
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pusher ${res.status}: ${text}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch (err) {
    if (err.message?.startsWith('Pusher')) throw err;
    console.error('[pusher-realtime]', err.message);
    return null;
  }
}

/**
 * Trigger an event on one or more channels.
 * @param {string|string[]} channels - Channel name(s) to trigger on
 * @param {string} eventName - Name of the event
 * @param {object} data - Event payload (will be JSON-serialized)
 * @param {string} [socketId] - Optional socket ID to exclude from recipients
 * @returns {Promise<object|null>} Empty object on success, null on failure
 */
export async function triggerEvent(channels, eventName, data, socketId) {
  if (!channels || !eventName || data === undefined) {
    throw new Error('channels, eventName, and data are required');
  }
  const channelList = Array.isArray(channels) ? channels : [channels];
  const payload = {
    name: eventName,
    channels: channelList,
    data: JSON.stringify(data),
  };
  if (socketId) payload.socket_id = socketId;
  return request('POST', '/events', JSON.stringify(payload));
}

/**
 * Trigger multiple events in a single API call (max 10 per batch).
 * @param {Array<{channel: string, name: string, data: object}>} batch - Array of event objects
 * @returns {Promise<object|null>} Empty object on success, null on failure
 */
export async function triggerBatch(batch) {
  if (!Array.isArray(batch) || batch.length === 0) {
    throw new Error('batch must be a non-empty array of events');
  }
  if (batch.length > 10) {
    throw new Error('Pusher batch API supports a maximum of 10 events');
  }
  const payload = {
    batch: batch.map((evt) => ({
      channel: evt.channel,
      name: evt.name,
      data: JSON.stringify(evt.data),
    })),
  };
  return request('POST', '/batch_events', JSON.stringify(payload));
}

/**
 * Get information about a channel (occupied status, subscription/user counts).
 * @param {string} channel - Channel name
 * @param {object} [options] - Query options
 * @param {boolean} [options.subscription_count] - Include subscription count
 * @param {boolean} [options.user_count] - Include user count (presence channels only)
 * @returns {Promise<{occupied: boolean, subscription_count?: number, user_count?: number}|null>}
 */
export async function getChannelInfo(channel, options = {}) {
  if (!channel) {
    throw new Error('channel name is required');
  }
  const infoAttrs = [];
  if (options.subscription_count) infoAttrs.push('subscription_count');
  if (options.user_count) infoAttrs.push('user_count');
  const suffix = infoAttrs.length
    ? `/channels/${encodeURIComponent(channel)}?info=${infoAttrs.join(',')}`
    : `/channels/${encodeURIComponent(channel)}`;
  // info param is added to the path; authParams will be appended separately
  return request('GET', `/channels/${encodeURIComponent(channel)}`);
}

/**
 * Get the list of users subscribed to a presence channel.
 * @param {string} channel - Presence channel name (must start with "presence-")
 * @param {object} [options] - Unused, reserved for future use
 * @returns {Promise<{users: Array<{id: string}>}|null>}
 */
export async function getPresenceUsers(channel) {
  if (!channel) {
    throw new Error('channel name is required');
  }
  if (!channel.startsWith('presence-')) {
    throw new Error('getPresenceUsers requires a presence channel (prefix "presence-")');
  }
  return request('GET', `/channels/${encodeURIComponent(channel)}/users`);
}
