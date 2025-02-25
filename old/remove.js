const { PDFDocument, rgb } = require('pdf-lib');
const { createCanvas } = require('canvas');
const jsQR = require('jsqr');
const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const inputPdfPath = 'input_pdfs/3M0SA3E-09LK21CT0 3.pdf';
const outputPdfPath = 'output.pdf';


function thresholdImage(context) {
  const { width, height } = context.canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Convert to grayscale
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    // Simple threshold
    const val = gray < 128 ? 0 : 255;
    data[i] = val;     // R
    data[i + 1] = val; // G
    data[i + 2] = val; // B
    // data[i + 3] = 255; // Alpha (fully opaque)
  }

  context.putImageData(imageData, 0, 0);
}

async function removeQrCodeFromPdf() {
  const pdfData = new Uint8Array(fs.readFileSync(inputPdfPath));
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdfDocument = await loadingTask.promise;
  const pdfDoc = await PDFDocument.load(pdfData);

  for (let pageIndex = 0; pageIndex < pdfDocument.numPages; pageIndex++) {
    const page = await pdfDocument.getPage(pageIndex + 1);
    // Your chosen scale factor
    const s = 4.0;
    const viewport = page.getViewport({ scale: s });

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    // After rendering the page onto the canvas:
    thresholdImage(context);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const qrCode = jsQR(imageData.data, imageData.width, imageData.height);

    if (qrCode) {
      console.log(qrCode)
      console.log(`🔍 QR code found on page ${pageIndex + 1}:`, qrCode.location);


      // ... after detecting QR code in the scaled canvas ...
      const topLeft = qrCode.location.topLeftCorner;
      const bottomRight = qrCode.location.bottomRightCorner;

      const xScaled = topLeft.x;
      const yScaled = topLeft.y;
      const wScaled = Math.abs(bottomRight.x - topLeft.x);
      const hScaled = Math.abs(bottomRight.y - topLeft.y);

      // Convert scaled coords -> PDF coords
      const xPdf = xScaled / s;
      const wPdf = wScaled / s;
      const hPdf = hScaled / s;

      // For the Y-axis, PDF is bottom-left, so flip:
      const pdfPage = pdfDoc.getPages()[pageIndex];
      const pdfHeight = pdfPage.getHeight();  // page height in PDF coords
      // Move from top-left (canvas) to bottom-left (PDF):
      const yPdf = pdfHeight - (yScaled / s) - hPdf;

      // Draw your rectangle in the PDF coordinate space
      const padding = 2;
      pdfPage.drawRectangle({
        x: xPdf - padding,
        y: yPdf - padding,
        width: wPdf + padding * 2,
        height: hPdf + padding * 2,
        color: rgb(1, 1, 1), // Red, just for testing
      });

      console.log(`✅ QR code covered on page ${pageIndex + 1}`);
    } else {
      console.log(`ℹ️ No QR code found on page ${pageIndex + 1}`);
    }
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPdfPath, pdfBytes);
  console.log(`🎉 New PDF saved as ${outputPdfPath} with QR codes removed!`);
}

// Execute
removeQrCodeFromPdf().catch(console.error);
