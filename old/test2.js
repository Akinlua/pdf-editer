const  { getDocument } = require("pdfjs-dist")
const { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } = require("@zxing/library")
const { createCanvas, Image }  = require("canvas")
const fs = require("fs")




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
  
/**
 * Extract all QR codes and their positions from a PDF in Node.js.
 * @param {string} pdfPath - Path to the PDF file.
 * @returns {Promise<Array>} - Detected QR codes with position per page.
 */
async function extractQRCodesFromPDF(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = getDocument({ data });
  const pdf = await loadingTask.promise;

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  const reader = new MultiFormatReader();
  reader.setHints(hints);

  const results = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 4 });

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    await page.render({ canvasContext: context, viewport }).promise;
    console.log(`Rendered page ${pageNum}.`);

    thresholdImage(context);

    // const fs = require('fs');
    // fs.writeFileSync(`page_${pageNum}.png`, canvas.toBuffer('image/png'));

    try {
      const check = await detectWithJimp(canvas);
      console.log(check);
      
      // const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      // const luminanceSource = new RGBLuminanceSource(imageData.data, canvas.width, canvas.height);
      // const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));

      // try {
      //   const detection = reader.decode(binaryBitmap);
      //   if (detection) {
      //     results.push({
      //       page: pageNum,
      //       data: detection.getText(),
      //       position: detection.getResultPoints().map((p) => ({
      //         x: p.getX(),
      //         y: p.getY(),
      //       })),
      //     });
      //     console.log(`Page ${pageNum}: QR code found.`);
      //   }
      // } catch (err) {
      //   console.log(`Page ${pageNum}: No QR codes detected.`);
      // }
    } catch (err) {
      console.log(`Page ${pageNum}: Error during QR code detection - ${err}`);
    }
  }

  return results;
}

// Usage Example
(async () => {
  const pdfPath = './3M0SA3E-09LK21CT0 16.pdf'; // Replace with your actual PDF path
  const qrCodes = await extractQRCodesFromPDF(pdfPath);

  if (qrCodes.length === 0) {
    console.log('No QR codes found in the document.');
  } else {
    console.log('Detected QR codes:', JSON.stringify(qrCodes, null, 2));
  }
})();



const Jimp = require('jimp');
const QrCode = require('qrcode-reader');

async function detectWithJimp(canvas) {
    const image = await Jimp.read(canvas.toBuffer('image/png'));
    return new Promise((resolve, reject) => {
        const qr = new QrCode();
        qr.callback = (err, value) => (err ? reject(err) : resolve(value));
        qr.decode(image.bitmap);
    });
}
