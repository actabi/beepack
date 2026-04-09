# PDF Generator

Zero-dependency PDF generator. Create documents with text, headings, lines, and multi-page support.

## Prerequisites

- Node.js >= 18

## Usage

### Simple Document

```js
import { createPdf } from './index.js';
import { writeFileSync } from 'fs';
const pdf = createPdf({ title: "Report" })
  .addHeading("Monthly Report")
  .addSpace()
  .addText("Generated: " + new Date().toLocaleDateString())
  .addLine()
  .addText("Content here...")
  .build();
writeFileSync("report.pdf", pdf);
```

### Multi-page

```js
const pdf = createPdf()
  .addHeading("Page 1").addText("Content...")
  .addPage()
  .addHeading("Page 2").addText("More content...")
  .build();
```

## Source

Based on [pdfkit/pdfkit](https://github.com/pdfkit/pdfkit) by **PDFKit** — 2,939+ stars on GitHub.