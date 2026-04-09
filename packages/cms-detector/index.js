import * as cheerio from "cheerio";

const MAX_BODY_SIZE = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// CMS patterns - ordered by French small-business prevalence
// ---------------------------------------------------------------------------

const CMS_PATTERNS = [
  // -- Generic CMS / Website Builders --
  {
    name: "WordPress",
    generator: "wordpress",
    htmlMarkers: ["/wp-content/", "/wp-includes/", "wp-emoji-release.min.js"],
    versionRegex: /wordpress\s+([\d.]+)/i,
  },
  {
    name: "Wix",
    generator: "wix.com",
    htmlMarkers: ["static.parastorage.com", "wix-bolt"],
    headerKey: "x-wix-request-id",
  },
  {
    name: "Squarespace",
    generator: "squarespace",
    htmlMarkers: ["<!-- This is Squarespace", "sqsp.net", "squarespace-cdn.com"],
  },
  {
    name: "Shopify",
    htmlMarkers: ["cdn.shopify.com", "Shopify.theme", "myshopify.com"],
    headerKey: "x-shopid",
  },
  {
    name: "Jimdo",
    generator: "jimdo",
    htmlMarkers: ["jimdo.com"],
  },
  {
    name: "Simplebo",
    htmlMarkers: ["simplebo.fr", "simplebo"],
  },
  {
    name: "Joomla",
    generator: "joomla",
    htmlMarkers: ["/components/com_", "/media/com_"],
    versionRegex: /joomla!\s*([\d.]+)/i,
  },
  {
    name: "Drupal",
    generator: "drupal",
    htmlMarkers: ["Drupal.settings", "/sites/default/files/"],
    versionRegex: /drupal\s+([\d.]+)/i,
  },
  {
    name: "PrestaShop",
    generator: "prestashop",
    htmlMarkers: ["/modules/ps_", "/themes/classic/"],
    versionRegex: /prestashop\s+([\d.]+)/i,
  },
  {
    name: "Webflow",
    generator: "webflow",
    htmlMarkers: ["assets.website-files.com", "webflow.js"],
  },
  {
    name: "Weebly",
    htmlMarkers: ["weebly.com", "editmysite.com"],
  },
  {
    name: "Strikingly",
    htmlMarkers: ["strikingly.com", "s.strikinglydns.com"],
  },
  {
    name: "1&1 IONOS",
    generator: "1&1",
    htmlMarkers: ["1and1.fr", "uicdn.net"],
  },
  // -- Real Estate Platforms (French) --
  {
    name: "La Boite Immo",
    htmlMarkers: ["staticlbi.com", "la-boite-immo.com", "la-boite-immo.fr"],
  },
  {
    name: "Apimo",
    htmlMarkers: [
      "design by apimo",
      ".web.apimo.pro",
      "apimo.net",
      "d36vnx92dgl2c5.cloudfront.net",
    ],
  },
  {
    name: "Immofacile (Orisha)",
    htmlMarkers: [
      "cdn.static.immosquare.com",
      "cdn.production.cloudphoto.io",
      "legals.immosquare.com",
    ],
  },
];

// Framework detection
const FRAMEWORK_MARKERS = {
  React: {
    resourceMarkers: ["react.production.min.js", "react-dom"],
    htmlMarkers: ["_reactRootContainer"],
  },
  Vue: {
    resourceMarkers: ["vue.runtime", "vue.global"],
    htmlMarkers: ["data-v-"],
  },
  Angular: {
    resourceMarkers: ["angular.min.js"],
    htmlMarkers: ["ng-version", "ng-app"],
  },
  jQuery: {
    resourceMarkers: ["jquery.min.js", "jquery.js"],
  },
  Bootstrap: {
    resourceMarkers: ["bootstrap.min.css", "bootstrap.min.js"],
  },
  Tailwind: {
    resourceMarkers: ["tailwindcss"],
  },
};

// Analytics detection
const ANALYTICS_MARKERS = {
  "Google Analytics": {
    resourceMarkers: ["google-analytics.com/analytics.js", "googletagmanager.com/gtag/js"],
  },
  "Google Tag Manager": {
    resourceMarkers: ["googletagmanager.com/gtm.js"],
  },
  Matomo: {
    resourceMarkers: ["matomo.js", "piwik.js"],
  },
  "Facebook Pixel": {
    resourceMarkers: ["connect.facebook.net"],
  },
  Hotjar: {
    resourceMarkers: ["static.hotjar.com"],
  },
};

/**
 * Detect CMS, frameworks, analytics, and server technology from a website.
 * Lightweight approach: single fetch + cheerio + pattern matching.
 *
 * @param {string} url - The website URL to analyze
 * @returns {Promise<{cms: string|null, cmsVersion: string|null, frameworks: string[], analytics: string[], server: string|null, poweredBy: string|null, fetchFailed: boolean}>}
 */
export async function detectCms(url) {
  const targetUrl = url.startsWith("http") ? url : `https://${url}`;

  const result = {
    cms: null,
    cmsVersion: null,
    frameworks: [],
    analytics: [],
    server: null,
    poweredBy: null,
    fetchFailed: false,
  };

  // --- Fetch HTML + capture headers ---
  let html;
  let headers;
  try {
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CmsDetectorBot/1.0)",
      },
      redirect: "follow",
    });
    const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
    if (contentLength > MAX_BODY_SIZE) {
      result.fetchFailed = true;
      return result;
    }
    headers = response.headers;
    html = await response.text();
    if (html.length > MAX_BODY_SIZE) {
      html = html.substring(0, MAX_BODY_SIZE);
    }
  } catch {
    result.fetchFailed = true;
    return result;
  }

  // --- Server / X-Powered-By headers ---
  result.server = headers.get("server") ?? null;
  result.poweredBy = headers.get("x-powered-by") ?? null;

  const $ = cheerio.load(html);
  const htmlLower = html.toLowerCase();

  // --- CMS detection ---
  const generatorContent = $('meta[name="generator"]').attr("content") ?? "";
  const generatorLower = generatorContent.toLowerCase();

  for (const pattern of CMS_PATTERNS) {
    // Check generator tag
    if (pattern.generator && generatorLower.includes(pattern.generator)) {
      result.cms = pattern.name;
      if (pattern.versionRegex) {
        const versionMatch = generatorContent.match(pattern.versionRegex);
        if (versionMatch) {
          result.cmsVersion = versionMatch[1];
        }
      }
      break;
    }

    // Check headers
    if (pattern.headerKey && headers.get(pattern.headerKey)) {
      result.cms = pattern.name;
      break;
    }

    // Check HTML markers
    if (pattern.htmlMarkers) {
      const found = pattern.htmlMarkers.some((marker) => htmlLower.includes(marker.toLowerCase()));
      if (found) {
        result.cms = pattern.name;
        if (pattern.versionRegex) {
          const versionMatch = generatorContent.match(pattern.versionRegex);
          if (versionMatch) {
            result.cmsVersion = versionMatch[1];
          }
        }
        break;
      }
    }
  }

  // --- Extract resource URLs and inline script content ---
  const resourceUrls = [];
  const inlineScriptText = [];
  $("script").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      resourceUrls.push(src.toLowerCase());
    } else {
      const text = $(el).text();
      if (text.length > 0 && text.length < 50_000) {
        inlineScriptText.push(text.toLowerCase());
      }
    }
  });
  $("link[href]").each((_, el) => {
    resourceUrls.push(($(el).attr("href") ?? "").toLowerCase());
  });
  const allScriptContent = inlineScriptText.join("\n");

  // Helper: check if a marker matches resource URLs or inline script content
  const matchesResources = (markers) =>
    markers?.some((m) => {
      const ml = m.toLowerCase();
      return resourceUrls.some((u) => u.includes(ml)) || allScriptContent.includes(ml);
    }) ?? false;

  // --- Framework detection ---
  for (const [name, marker] of Object.entries(FRAMEWORK_MARKERS)) {
    const matchesHtml = marker.htmlMarkers?.some((m) => htmlLower.includes(m.toLowerCase()));
    if (matchesResources(marker.resourceMarkers) || matchesHtml) {
      result.frameworks.push(name);
    }
  }

  // --- Analytics detection ---
  for (const [name, marker] of Object.entries(ANALYTICS_MARKERS)) {
    const matchesHtml = marker.htmlMarkers?.some((m) => htmlLower.includes(m.toLowerCase()));
    if (matchesResources(marker.resourceMarkers) || matchesHtml) {
      result.analytics.push(name);
    }
  }

  return result;
}
