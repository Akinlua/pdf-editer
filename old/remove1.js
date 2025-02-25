const fs = require('fs');
const { createCanvas } = require('canvas');
const jsQR = require('jsqr');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { PDFDocument, rgb } = require('pdf-lib');

async function removeMultipleQrCodes(inputPdf, outputPdf) {
  const pdfBytes = fs.readFileSync(inputPdf);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) });
  const pdfjsDoc = await loadingTask.promise;
  const pdfDoc = await PDFDocument.load(pdfBytes);

  for (let pageIndex = 0; pageIndex < pdfjsDoc.numPages; pageIndex++) {
    const page = await pdfjsDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 15.0 });

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    await page.render({ canvasContext: context, viewport }).promise;

    // Optional: threshold the image
    thresholdImage(context);

    // Detect multiple QR codes by repeated scanning
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const codes = detectMultipleQrCodes(imageData);

    console.log(`Page ${pageIndex + 1} => Found ${codes.length} QR code(s)`);

    // Draw rectangle for each code in pdf-lib
    const pdfPage = pdfDoc.getPages()[pageIndex];
    const pdfHeight = pdfPage.getHeight();

    codes.forEach((qr) => {
      const loc = qr.location;
      // For robust coverage, compute bounding box from all corners
      const xs = [loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomLeftCorner.x, loc.bottomRightCorner.x];
      const ys = [loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomLeftCorner.y, loc.bottomRightCorner.y];

      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const wScaled = maxX - minX;
      const hScaled = maxY - minY;

      // Convert from scale=4.0 canvas coords to PDF coords
      const s = 15.0;
      const xPdf = minX / s;
      const wPdf = wScaled / s;
      const hPdf = hScaled / s;

      // Flip the y axis
      const yPdf = pdfHeight - (minY / s) - hPdf;

      // Cover with a white rectangle
      pdfPage.drawRectangle({
        x: xPdf,
        y: yPdf,
        width: wPdf,
        height: hPdf,
        color: rgb(1, 1, 1),
      });
    });
  }

  const outBytes = await pdfDoc.save();
  fs.writeFileSync(outputPdf, outBytes);
  console.log(`✅ Saved modified PDF with multiple QR codes removed => ${outputPdf}`);
}

// Mask-based repeated scan
function detectMultipleQrCodes(imageData) {
  const results = [];
  const { width, height, data } = imageData;

  while (true) {
    const qr = jsQR(data, width, height);
    if (!qr) break;
    results.push(qr);

    // Mask out the found code
    const loc = qr.location;
    const xs = [loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomLeftCorner.x, loc.bottomRightCorner.x];
    const ys = [loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomLeftCorner.y, loc.bottomRightCorner.y];
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(width, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(height, Math.ceil(Math.max(...ys)));

    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        const idx = (y * width + x) * 4;
        data[idx] = 255;     // R
        data[idx + 1] = 255; // G
        data[idx + 2] = 255; // B
        data[idx + 3] = 255; // A
      }
    }
  }

  return results;
}

// Simple threshold for better detection
function thresholdImage(context) {
  const { width, height } = context.canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const val = gray < 128 ? 0 : 255;
    data[i] = val;     // R
    data[i + 1] = val; // G
    data[i + 2] = val; // B
    // data[i + 3] = 255; // Alpha is unchanged or forced to opaque
  }
  context.putImageData(imageData, 0, 0);
}

// Run
removeMultipleQrCodes('input_pdfs/3M0SA3E-09LK21CT0 3.pdf', 'output.pdf').catch(console.error);
