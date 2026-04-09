// PDF Generator - Zero dependencies
// Generate simple PDF documents with text and basic formatting.
// Outputs raw PDF 1.4 format.

/**
 * Create a new PDF document builder.
 * @param {object} [opts]
 * @param {string} [opts.title] - Document title
 * @param {number} [opts.width=595] - Page width (A4)
 * @param {number} [opts.height=842] - Page height (A4)
 * @returns {object} PDF builder
 */
export function createPdf(opts = {}) {
  const { title = "", width = 595, height = 842 } = opts;
  const objects = [];
  const pages = [];
  let currentPage = { contents: [], y: height - 50 };
  const margin = { top: 50, bottom: 50, left: 50, right: 50 };
  let fontSize = 12;
  let objectCounter = 0;

  function addObj(content) {
    objectCounter++;
    objects.push({ id: objectCounter, content });
    return objectCounter;
  }

  function escPdf(text) {
    return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  const builder = {
    setFontSize(size) { fontSize = size; return builder; },

    addText(text, opts = {}) {
      const size = opts.fontSize || fontSize;
      const x = opts.x || margin.left;
      if (currentPage.y - size < margin.bottom) builder.addPage();
      currentPage.contents.push("BT /F1 " + size + " Tf " + x + " " + currentPage.y + " Td (" + escPdf(text) + ") Tj ET");
      currentPage.y -= size * 1.5;
      return builder;
    },

    addHeading(text, level = 1) {
      const sizes = { 1: 24, 2: 20, 3: 16 };
      return builder.addText(text, { fontSize: sizes[level] || 16 });
    },

    addSpace(points = 20) {
      currentPage.y -= points;
      if (currentPage.y < margin.bottom) builder.addPage();
      return builder;
    },

    addLine() {
      currentPage.contents.push(margin.left + " " + currentPage.y + " m " + (width - margin.right) + " " + currentPage.y + " l S");
      currentPage.y -= 10;
      return builder;
    },

    addPage() {
      pages.push(currentPage);
      currentPage = { contents: [], y: height - margin.top };
      return builder;
    },

    build() {
      pages.push(currentPage);
      let pdf = "%PDF-1.4\n";
      const fontId = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
      const pageIds = [];
      for (const page of pages) {
        const stream = page.contents.join("\n");
        const streamId = addObj("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
        const pageId = addObj("<< /Type /Page /Parent " + (objectCounter + pages.length - pageIds.length) + " 0 R /MediaBox [0 0 " + width + " " + height + "] /Contents " + streamId + " 0 R /Resources << /Font << /F1 " + fontId + " 0 R >> >> >>");
        pageIds.push(pageId);
      }
      const pagesObjId = addObj("<< /Type /Pages /Kids [" + pageIds.map(id => id + " 0 R").join(" ") + "] /Count " + pageIds.length + " >>");
      const catalogId = addObj("<< /Type /Catalog /Pages " + pagesObjId + " 0 R >>");
      let offset = pdf.length;
      const offsets = [];
      for (const obj of objects) {
        offsets.push(offset);
        const line = obj.id + " 0 obj\n" + obj.content + "\nendobj\n";
        pdf += line;
        offset += line.length;
      }
      const xrefStart = offset;
      pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
      offsets.forEach(o => { pdf += String(o).padStart(10, "0") + " 00000 n \n"; });
      pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root " + catalogId + " 0 R >>\nstartxref\n" + xrefStart + "\n%%EOF";
      return pdf;
    },
  };
  return builder;
}