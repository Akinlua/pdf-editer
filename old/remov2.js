const fs = require('fs');
const { createCanvas } = require('canvas');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { PDFDocument, rgb } = require('pdf-lib');
const jsQR = require('jsqr');

/**
 * Repeatedly scans the canvas for QR codes. After each detection,
 * it masks out the detected QR code area, updates the canvas image data,
 * and scans again.
 * 
 * @param {CanvasRenderingContext2D} context - The canvas 2D context.
 * @param {number} width - The canvas width.
 * @param {number} height - The canvas height.
 * @returns {Array} Array of detected QR code objects.
 */
function detectMultipleQrCodes(context, width, height) {
  const results = [];
  // Get the initial image data from the canvas.
  let imageData = context.getImageData(0, 0, width, height);

  while (true) {
    // Scan for a QR code in the current imageData.
    const qr = jsQR(imageData.data, width, height);
    if (!qr) break; // No more QR codes found.
    results.push(qr);

    // Determine the bounding box for the detected QR code.
    const loc = qr.location;
    const xs = [
      loc.topLeftCorner.x,
      loc.topRightCorner.x,
      loc.bottomLeftCorner.x,
      loc.bottomRightCorner.x,
    ];
    const ys = [
      loc.topLeftCorner.y,
      loc.topRightCorner.y,
      loc.bottomLeftCorner.y,
      loc.bottomRightCorner.y,
    ];
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(width, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(height, Math.ceil(Math.max(...ys)));

    // Mask out the detected QR code area (set pixels to white).
    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        const idx = (y * width + x) * 4;
        imageData.data[idx] = 255;     // R
        imageData.data[idx + 1] = 255; // G
        imageData.data[idx + 2] = 255; // B
        imageData.data[idx + 3] = 255; // A
      }
    }

    // Update the canvas with the masked imageData.
    context.putImageData(imageData, 0, 0);
    // Re-read the image data for the next iteration.
    imageData = context.getImageData(0, 0, width, height);
  }

  return results;
}

/**
 * Processes each page of the input PDF:
 *  - Renders the page to a canvas at a high scale.
 *  - Uses the revised mask-based repeated scan to detect multiple QR codes.
 *  - Converts the detected canvas coordinates back to PDF coordinates.
 *  - Covers each detected QR code with a white rectangle.
 * Finally, saves the modified PDF.
 */
async function processPdf(inputPdf, outputPdf) {
  // Load the PDF bytes.
  const pdfBytes = fs.readFileSync(inputPdf);

  // Load the PDF for rendering using pdfjs-dist.
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) });
  const pdfjsDoc = await loadingTask.promise;
  // Also load the PDF with pdf-lib for modification.
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Choose a rendering scale (e.g., 4.0 for high resolution).
  const scale = 10.0;

  for (let pageIndex = 0; pageIndex < pdfjsDoc.numPages; pageIndex++) {
    // Render page using pdfjs-dist.
    const page = await pdfjsDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    await page.render({ canvasContext: context, viewport }).promise;

    // Optionally, you could apply additional thresholding here to improve contrast.

    // Detect all QR codes on this page using our updated function.
    const qrCodes = detectMultipleQrCodes(context, canvas.width, canvas.height);
    console.log(`Page ${pageIndex + 1}: Found ${qrCodes.length} QR code(s).`);

    // Get the corresponding page from pdf-lib.
    const pdfPage = pdfDoc.getPages()[pageIndex];
    const pdfHeight = pdfPage.getHeight();

    // For each detected QR code, convert the canvas coordinates (scaled) to PDF coordinates.
    qrCodes.forEach(qr => {
      const loc = qr.location;
      const xs = [
        loc.topLeftCorner.x,
        loc.topRightCorner.x,
        loc.bottomLeftCorner.x,
        loc.bottomRightCorner.x,
      ];
      const ys = [
        loc.topLeftCorner.y,
        loc.topRightCorner.y,
        loc.bottomLeftCorner.y,
        loc.bottomRightCorner.y,
      ];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const wCanvas = maxX - minX;
      const hCanvas = maxY - minY;

      // Convert canvas coordinates to PDF coordinates.
      const xPdf = minX / scale;
      const wPdf = wCanvas / scale;
      const hPdf = hCanvas / scale;
      // Flip Y coordinate (canvas origin is top-left; PDF is bottom-left).
      const yPdf = pdfHeight - (minY / scale) - hPdf;

      // Cover the detected QR code with a white rectangle.
      pdfPage.drawRectangle({
        x: xPdf,
        y: yPdf,
        width: wPdf,
        height: hPdf,
        color: rgb(1, 1, 1),
      });

      console.log(`Covered QR code at: (${xPdf.toFixed(2)}, ${yPdf.toFixed(2)}, ${wPdf.toFixed(2)}, ${hPdf.toFixed(2)})`);
    });
  }

  // Save the modified PDF.
  const modifiedPdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPdf, modifiedPdfBytes);
  console.log(`Modified PDF saved as ${outputPdf}`);
}

// Run the processing function.
processPdf('input_pdfs/output.pdf', 'output.pdf').catch(err => console.error(err));
