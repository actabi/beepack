// PDF Invoice Generator
// Zero dependencies - generates PDF files using raw PDF specification.
// Produces clean, professional invoices from structured data.

/**
 * Generate a PDF invoice buffer from invoice data.
 *
 * @param {object} invoice
 * @param {object} invoice.from - Seller info {name, address, email?, phone?, taxId?}
 * @param {object} invoice.to - Buyer info {name, address, email?, taxId?}
 * @param {string} invoice.number - Invoice number (e.g. "INV-2026-001")
 * @param {string} invoice.date - Invoice date (e.g. "2026-04-08")
 * @param {string} [invoice.dueDate] - Payment due date
 * @param {Array<{description: string, quantity: number, unitPrice: number, taxRate?: number}>} invoice.items
 * @param {string} [invoice.currency="USD"] - Currency code
 * @param {string} [invoice.notes] - Additional notes
 * @param {string} [invoice.paymentTerms] - Payment instructions
 * @returns {Uint8Array} PDF file as binary buffer
 */
export function generateInvoice(invoice) {
  const {
    from,
    to,
    number,
    date,
    dueDate,
    items,
    currency = "USD",
    notes,
    paymentTerms,
  } = invoice;

  const totals = calculateTotals(items);
  const currencySymbol = CURRENCY_SYMBOLS[currency] || currency + " ";

  // Build PDF content stream
  const lines = [];
  let y = 750;

  // Header
  lines.push(textCmd(50, y, from.name, 18, true));
  y -= 20;
  for (const line of splitAddress(from.address)) {
    lines.push(textCmd(50, y, line, 9));
    y -= 13;
  }
  if (from.email) { lines.push(textCmd(50, y, from.email, 9)); y -= 13; }
  if (from.phone) { lines.push(textCmd(50, y, from.phone, 9)); y -= 13; }
  if (from.taxId) { lines.push(textCmd(50, y, `Tax ID: ${from.taxId}`, 9)); y -= 13; }

  // Invoice title and meta (right side)
  lines.push(textCmd(400, 750, "INVOICE", 24, true));
  lines.push(textCmd(400, 725, `#${number}`, 11));
  lines.push(textCmd(400, 710, `Date: ${date}`, 10));
  if (dueDate) lines.push(textCmd(400, 696, `Due: ${dueDate}`, 10));

  // Bill To
  y = Math.min(y, 660);
  y -= 10;
  lines.push(textCmd(50, y, "Bill To:", 10, true));
  y -= 15;
  lines.push(textCmd(50, y, to.name, 11, true));
  y -= 14;
  for (const line of splitAddress(to.address)) {
    lines.push(textCmd(50, y, line, 9));
    y -= 13;
  }
  if (to.email) { lines.push(textCmd(50, y, to.email, 9)); y -= 13; }
  if (to.taxId) { lines.push(textCmd(50, y, `Tax ID: ${to.taxId}`, 9)); y -= 13; }

  // Table header
  y -= 20;
  const tableTop = y;
  lines.push(lineCmd(50, y, 545, y));
  y -= 15;
  lines.push(textCmd(50, y, "Description", 10, true));
  lines.push(textCmd(320, y, "Qty", 10, true));
  lines.push(textCmd(380, y, "Unit Price", 10, true));
  lines.push(textCmd(470, y, "Amount", 10, true));
  y -= 5;
  lines.push(lineCmd(50, y, 545, y));

  // Table rows
  for (const item of items) {
    y -= 18;
    if (y < 100) break; // prevent overflow
    const amount = item.quantity * item.unitPrice;
    lines.push(textCmd(50, y, truncate(item.description, 45), 9));
    lines.push(textCmd(330, y, String(item.quantity), 9));
    lines.push(textCmd(380, y, formatAmount(item.unitPrice, currencySymbol), 9));
    lines.push(textCmd(470, y, formatAmount(amount, currencySymbol), 9));
  }

  // Totals
  y -= 10;
  lines.push(lineCmd(350, y, 545, y));
  y -= 18;
  lines.push(textCmd(370, y, "Subtotal:", 10));
  lines.push(textCmd(470, y, formatAmount(totals.subtotal, currencySymbol), 10));

  if (totals.tax > 0) {
    y -= 16;
    lines.push(textCmd(370, y, "Tax:", 10));
    lines.push(textCmd(470, y, formatAmount(totals.tax, currencySymbol), 10));
  }

  y -= 18;
  lines.push(lineCmd(350, y + 12, 545, y + 12));
  lines.push(textCmd(370, y, "Total:", 12, true));
  lines.push(textCmd(470, y, formatAmount(totals.total, currencySymbol), 12, true));

  // Notes and payment terms
  if (notes || paymentTerms) {
    y -= 40;
    if (notes) {
      lines.push(textCmd(50, y, "Notes:", 10, true));
      y -= 14;
      for (const line of wrapText(notes, 80)) {
        lines.push(textCmd(50, y, line, 9));
        y -= 13;
      }
    }
    if (paymentTerms) {
      y -= 10;
      lines.push(textCmd(50, y, "Payment Terms:", 10, true));
      y -= 14;
      for (const line of wrapText(paymentTerms, 80)) {
        lines.push(textCmd(50, y, line, 9));
        y -= 13;
      }
    }
  }

  return buildPdf(lines.join("\n"));
}

/**
 * Calculate invoice totals from line items.
 *
 * @param {Array<{quantity: number, unitPrice: number, taxRate?: number}>} items
 * @returns {{subtotal: number, tax: number, total: number, items: Array<{amount: number, taxAmount: number}>}}
 */
export function calculateTotals(items) {
  let subtotal = 0;
  let tax = 0;
  const itemDetails = [];

  for (const item of items) {
    const amount = item.quantity * item.unitPrice;
    const taxAmount = item.taxRate ? amount * (item.taxRate / 100) : 0;
    subtotal += amount;
    tax += taxAmount;
    itemDetails.push({ amount: round2(amount), taxAmount: round2(taxAmount) });
  }

  return {
    subtotal: round2(subtotal),
    tax: round2(tax),
    total: round2(subtotal + tax),
    items: itemDetails,
  };
}

// --- PDF Generation Internals ---

function buildPdf(contentStream) {
  const objects = [];
  let objNum = 0;

  function addObj(content) {
    objNum++;
    objects.push({ num: objNum, content });
    return objNum;
  }

  // Object 1: Catalog
  addObj("<< /Type /Catalog /Pages 2 0 R >>");

  // Object 2: Pages
  addObj("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");

  // Object 3: Page
  addObj(
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
    "/Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>"
  );

  // Object 4: Content stream
  const streamContent = contentStream;
  addObj(`<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`);

  // Object 5: Font (Helvetica)
  addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  // Object 6: Font (Helvetica-Bold)
  addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  // Build PDF bytes
  let pdf = "%PDF-1.4\n";
  const offsets = [];

  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj.num} 0 obj\n${obj.content}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

function textCmd(x, y, text, size, bold = false) {
  const escaped = escapePdf(text);
  const font = bold ? "/F2" : "/F1";
  return `BT ${font} ${size} Tf ${x} ${y} Td (${escaped}) Tj ET`;
}

function lineCmd(x1, y1, x2, y2) {
  return `0.8 G 0.5 w ${x1} ${y1} m ${x2} ${y2} l S`;
}

function escapePdf(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatAmount(amount, symbol) {
  return `${symbol}${amount.toFixed(2)}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 3) + "..." : str;
}

function splitAddress(address) {
  return address.split(/\n|,\s*/).filter(Boolean);
}

function wrapText(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      lines.push(current.trim());
      current = word;
    } else {
      current += " " + word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

const CURRENCY_SYMBOLS = {
  USD: "$",
  EUR: "\u20AC",
  GBP: "\u00A3",
  JPY: "\u00A5",
  CAD: "CA$",
  AUD: "A$",
  CHF: "CHF ",
  CNY: "\u00A5",
  INR: "\u20B9",
  BRL: "R$",
};
