# qr-code-generator

Generate QR codes as SVG, PNG data URIs, or raw PNG buffers — with high-level helpers for URLs, WiFi credentials, vCards, and SEPA payment transfers (EPC069-12).

## Setup

```bash
npm install qrcode
```

The `qrcode` package is the only dependency and is loaded lazily on first use.

## Usage

### Generate an SVG (inline or as a file)

```js
import { generateQR } from "./index.js";

const svg = await generateQR("https://example.com");
// Returns an SVG string you can embed directly in HTML or write to a .svg file.

// Custom size and error correction
const svg = await generateQR("Hello, world!", {
  width: 512,
  errorCorrectionLevel: "H",               // 'L' | 'M' | 'Q' | 'H'
  color: { dark: "#1a1a1a", light: "#fafafa" },
});
```

### Generate a PNG data URI

Ideal for `<img src="...">` tags or embedding in emails.

```js
import { generateQRDataURI } from "./index.js";

const dataUri = await generateQRDataURI("https://example.com");
// "data:image/png;base64,..."

// In an HTML template
const html = `<img src="${dataUri}" alt="QR code" width="256" height="256">`;

// Custom quiet zone
const dataUri = await generateQRDataURI("https://example.com", { margin: 2, width: 400 });
```

### Generate a raw PNG buffer

Useful for writing to disk or streaming in HTTP responses.

```js
import { generateQRBuffer } from "./index.js";
import { writeFileSync } from "fs";

const buffer = await generateQRBuffer("https://example.com");
writeFileSync("qr.png", buffer);

// Stream in an Express route
app.get("/qr.png", async (req, res) => {
  const buffer = await generateQRBuffer(req.query.data);
  if (!buffer) return res.status(400).send("Invalid data");
  res.setHeader("Content-Type", "image/png");
  res.send(buffer);
});
```

### URL QR code

Validates the URL before encoding — returns `null` for malformed input.

```js
import { urlQR } from "./index.js";

const svg = await urlQR("https://beepack.dev/packages/qr-code-generator");

// Invalid URLs are rejected without throwing
const svg = await urlQR("not-a-url"); // null — logged to console.error
```

### WiFi QR code

Lets mobile devices connect by scanning — no typing required.

```js
import { wifiQR } from "./index.js";

// WPA/WPA2 network
const svg = await wifiQR("MyNetwork", "s3cr3tpassword");

// Open network (no password)
const svg = await wifiQR("CafeGuest", "", { security: "nopass" });

// Hidden WPA network
const svg = await wifiQR("HiddenNet", "hunter2", { hidden: true });

// WEP network (legacy)
const svg = await wifiQR("OldRouter", "abc123", { security: "WEP" });
```

### vCard QR code

Scanning prompts the user to save the contact on most mobile devices.

```js
import { vcardQR } from "./index.js";

// Minimal — name only
const svg = await vcardQR({ firstName: "Ada", lastName: "Lovelace" });

// Full contact
const svg = await vcardQR({
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+14155552671",
  email: "ada@example.com",
  org: "Analytical Engine Co.",
  url: "https://ada.example.com",
  address: "123 Babbage St, London, UK",
});
```

### SEPA payment QR code (EPC069-12)

Populates bank transfer fields in compatible EU banking apps when scanned.

```js
import { sepaQR } from "./index.js";

// Fixed amount payment
const svg = await sepaQR({
  name: "Acme GmbH",
  iban: "DE89 3704 0044 0532 0130 00",
  bic: "COBADEFFXXX",
  amount: 99.50,
  remittance: "Invoice #2026-042",
});

// Variable amount (amount omitted — payer fills it in)
const svg = await sepaQR({
  name: "Charity Foundation",
  iban: "FR7630006000011234567890189",
  remittance: "Donation",
});

// With structured creditor reference
const svg = await sepaQR({
  name: "Landlord BV",
  iban: "NL91ABNA0417164300",
  amount: 850.00,
  reference: "RF18539007547034",
});
```

### Escape special characters manually

`escapeQRSpecial` is exported for cases where you build a custom QR payload with WiFi- or vCard-style fields.

```js
import { escapeQRSpecial } from "./index.js";

escapeQRSpecial('pass"word;1,2'); // 'pass\\"word\\;1\\,2'
```

## Edge Cases Handled

- **Missing `qrcode` package** — throws a clear install instruction (`npm install qrcode`) instead of a cryptic module-not-found error; the module is lazy-loaded so import never fails at parse time
- **Invalid input types** — all exported functions validate their primary argument and return `null` with a descriptive `console.error` rather than throwing, so callers can check for falsy without try/catch
- **WiFi special characters** — `\`, `;`, `,`, and `"` in the SSID and password are backslash-escaped per the WiFi QR standard to prevent premature field termination
- **vCard partial names** — accepts contacts with only a `firstName` or only a `lastName`; both fields default to empty string rather than "undefined"
- **IBAN whitespace and case** — spaces are stripped and letters uppercased before the format check, so `"DE89 3704 0044 0532 0130 00"` and `"de89370400440532013000"` are both accepted
- **SEPA field truncation** — beneficiary name is silently capped at 70 characters, creditor reference at 35, and remittance information at 140, matching EPC069-12 limits
- **SEPA optional BIC** — BIC is optional from version 002 of the EPC standard; passing an empty string or omitting it produces a valid payload
- **Amount formatting** — `amount` is coerced via `Number()` and formatted to exactly two decimal places (`EUR12.50`); omitting `amount` leaves the field blank for variable-amount transfers
- **URL validation** — `urlQR` uses the WHATWG `URL` constructor to reject bare hostnames, relative paths, and other non-absolute URLs before generating anything
- **SVG vs PNG output** — `generateQR` forces `type: "svg"` regardless of any option passed; `generateQRDataURI` and `generateQRBuffer` use the PNG path so callers never get the wrong format by accident
