# pdf-invoice

Generate professional PDF invoices from structured data. Zero dependencies — builds valid PDF files using raw PDF specification. No Puppeteer, no wkhtmltopdf, no external services.

## Usage

```js
import { generateInvoice } from "./index.js";
import { writeFileSync } from "fs";

const pdf = generateInvoice({
  from: {
    name: "Acme Corp",
    address: "123 Business St, San Francisco, CA 94102",
    email: "billing@acme.com",
    taxId: "US-123456789",
  },
  to: {
    name: "Client Inc",
    address: "456 Client Ave, New York, NY 10001",
    email: "ap@client.com",
  },
  number: "INV-2026-001",
  date: "2026-04-08",
  dueDate: "2026-05-08",
  currency: "USD",
  items: [
    { description: "Web Development - April", quantity: 1, unitPrice: 5000 },
    { description: "Hosting (Pro Plan)", quantity: 1, unitPrice: 49.99 },
    { description: "SSL Certificate", quantity: 2, unitPrice: 25, taxRate: 10 },
  ],
  notes: "Thank you for your business!",
  paymentTerms: "Wire transfer to Acme Corp, Account: 1234567890, Routing: 021000021",
});

writeFileSync("invoice.pdf", pdf);
```

### Calculate Totals Separately

```js
import { calculateTotals } from "./index.js";

const totals = calculateTotals([
  { quantity: 10, unitPrice: 99.99, taxRate: 20 },
  { quantity: 1, unitPrice: 500 },
]);
// { subtotal: 1499.90, tax: 199.98, total: 1699.88, items: [...] }
```

## Supported Currencies

USD ($), EUR, GBP, JPY, CAD, AUD, CHF, CNY, INR, BRL. Pass any ISO 4217 code — unknown currencies use the code as prefix.

## What the PDF Includes

- Company header with contact details and tax ID
- Invoice number, date, and due date
- Bill-to section with client details
- Line item table (description, quantity, unit price, amount)
- Subtotal, tax, and total calculation
- Notes and payment terms sections

## Edge Cases Handled

- **Raw PDF generation** — no external tools, headless browsers, or services needed
- **Tax per line item** — each item can have its own tax rate
- **Multi-currency** — proper currency symbol formatting
- **Text wrapping** — long notes and payment terms wrap properly
- **PDF escaping** — special characters in text are escaped correctly
- **Overflow protection** — prevents content from running off the page
