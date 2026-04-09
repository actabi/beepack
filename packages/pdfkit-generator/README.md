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

Inspired by [pdfkit](https://github.com/pdfkit/pdfkit) (2.9k+ stars).