const fs = require('fs');
const axios = require('axios');
const { createCanvas } = require('canvas');
const { PDFDocument, rgb } = require('pdf-lib');
const jsQR = require('jsqr');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');
const puppeteer = require('puppeteer-core'); // Use Puppeteer Core

// Define the path to your Chromium or Chrome executable
// const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'; // Update this path
const CHROME_PATH = '/usr/bin/google-chrome'; // Update this path


// Define product links and sensitive texts
const products = [
    {
        link: "https://www.omegamotor.com.tr/en/product/detail/524",
        sensitiveText: [
            "Adress : Dudullu Organize Sanayi Bölgesi 2. Cadde No : 10 Ümraniye - İstanbul",
            "Telephone : +90 216 266 32 80",
            "Fax : +90 216 266 32 99",
            "E - mail : info@omegamotor.com.tr",
            "www.omegamotor.com.tr"
        ],
        selector: 'div.summary.entry-summary strong' // Add selector for product name
    },
];

// Function to fetch PDF links from a product page using Puppeteer Core
async function fetchPdfLinks(page) {
    // No need to launch a new browser instance; we use the existing page
    await page.goto(page.url(), { waitUntil: 'networkidle2', timeout: 30000000 });
    console.log(`Navigated to ${page.url()}`);

    const pdfLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href$=".pdf"]'));
        return links.map(link => link.href);
    });

    console.log(pdfLinks);
    return Array.from(new Set(pdfLinks)); // Remove duplicates
}

// Function to download PDFs
async function downloadPdf(url, outputPath) {
    const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream'
    });
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// Main function to process each product
async function processProducts() {
    const downloadDir = 'downloaded_pdfs';
    const outputDir = 'output_pdfs'; // Define output directory
    fs.mkdirSync(downloadDir, { recursive: true }); // Ensure the download directory exists
    fs.mkdirSync(outputDir, { recursive: true }); // Ensure the output directory exists

    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage(); // Create a single page instance

    for (const product of products) {
        await page.goto(product.link, { waitUntil: 'networkidle2', timeout: 30000000 });
        console.log(`Navigated to ${product.link}`);

        const productName = await getProductName(page, product.selector); // Get product name using the existing page
        const pdfLinks = await fetchPdfLinks(page); // Fetch PDF links using the same page instance
        console.log(`Downloading PDFs for ${product.link}:`, pdfLinks);

        // Extract domain and product name using the selector
        const domain = new URL(product.link).hostname;

        // Create directories for domain and product
        const productDir = path.join(downloadDir, domain, productName);
        const outputProductDir = path.join(outputDir, domain, productName);
        fs.mkdirSync(productDir, { recursive: true });
        fs.mkdirSync(outputProductDir, { recursive: true });

        let pdfCounter = 1; // Counter for naming PDFs
        for (const pdfLink of pdfLinks) {
            const pdfFileName = `${productName} ${pdfCounter}.pdf`; // Naming convention
            const pdfFilePath = path.join(productDir, pdfFileName); // Ensure this directory exists
            const outputPdfPath = path.join(outputProductDir, pdfFileName); // Define output PDF path

            await downloadPdf(pdfLink, pdfFilePath);
            await modifyPdf(pdfFilePath, outputPdfPath, 'cover_page.png', product.sensitiveText);
            pdfCounter++; // Increment counter for next PDF
        }
    }

    await browser.close(); // Close the browser after processing all products
}

// Function to get product name from the page using the selector
async function getProductName(page, selector) {
    await page.goto(page.url(), { waitUntil: 'networkidle2', timeout: 30000000 });
    const productName = await page.$eval(selector, el => el.innerText.trim());
    return productName;
}

// Call the main function
processProducts().catch(console.error);

// const sensitiveTexts = ["www.omegamotor.com.tr"];
let sensitiveText = "TECHNICAL DATASHEET"; // Changed from array to string



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

function getBoundingBoxForText(targetText, pageWords) {
    const words = pageWords.filter(word => word.text.includes(targetText));
    if (words.length === 0) throw new Error(`Text "${targetText}" not found on page`);

    const x = Math.min(...words.map(w => w.x));
    const y = Math.min(...words.map(w => w.y));
    const maxX = Math.max(...words.map(w => w.x + w.width));
    const maxY = Math.max(...words.map(w => w.y + w.height));

    return {
        x,
        y,
        width: maxX - x,
        height: maxY - y
    };
}


async function extractTextFromPdf(inputPdfPath) {
    const data = new Uint8Array(fs.readFileSync(inputPdfPath));
    const pdfjsLib = require('pdfjs-dist');
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pagesText = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        pagesText.push(pageText);
    }
    return pagesText;
}

async function ocrExtractText(pdfBuffer) {
    const formData = new FormData();
    formData.append('files', new Blob([pdfBuffer], { type: 'application/pdf' }));

    const response = await axios.post('http://194.31.150.41:4000/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });

    console.log("collected")
    if (response.data.success) {
        return response.data.success.flatMap(result => result.pages).map(page => ({
            text: page.text,
            words: page.words,
            page_height: page.page_height,
            page_width: page.page_width,
        }));
    } else {
        throw new Error('OCR extraction failed');
    }
}

// async function modifyPdf(inputPdfPath, outputPdfPath, coverImagePath, sensitiveText) {
//     const sensitiveWords = sensitiveText.split(/\s+/); // Split into words based on OCR splitting logic
//     console.log(sensitiveWords)
    
//     const existingPdfBytes = fs.readFileSync(inputPdfPath);
//     const pdfDoc = await PDFDocument.load(existingPdfBytes);
//     const pagesText = await extractTextFromPdf(inputPdfPath);
//     const ocrResults = await ocrExtractText(existingPdfBytes);


//     const pdfData = new Uint8Array(fs.readFileSync(inputPdfPath));
//     const loadingTask = pdfjsLib.getDocument({ data: pdfData });
//     const pdfDocument = await loadingTask.promise;
//     // const QrpdfDoc = await PDFDocument.load(pdfData);

   
//     let added_width
//     let added_height
//     for (let i = 0; i < pdfDoc.getPageCount(); i++) {
//         const page = pdfDoc.getPage(i);
//         const { width, height } = page.getSize();
//         if(i == 0) {
//             added_height= height
//             added_width = width
//         }    

//         // sensitiveTexts.forEach(text => {
//         for (const text of sensitiveWords) {
//             console.log("checking......")
//                 const ocrPageData = ocrResults[i];
//                 if (ocrPageData && ocrPageData.text.includes(text)) {
//                     console.log(`OCR found '${text}' on page ${i + 1}, applying redaction...`);
//                     const word = ocrPageData.words.find(w => w.text.includes(text));
//                     if (word && word.bbox) {
//                         const { x0, x1, y0, y1 } = word.bbox;
//                         const page_width = word.page_width
//                         const page_height = word.page_height

//                         console.log(page_width, page_height)
//                         console.log(word.bbox)
//                         console.log(`Page height: ${height}, OCR y0: ${y0}, y1: ${y1}`);
                        
//                         const ocrPageHeight = page_height;
//                         const scaleFactor = height / ocrPageHeight;
//                         console.log(`OCR PAGE HEIGHT ${ocrPageHeight}`)


//                         const correctedY0 = height - (y0); // 841.68 - (1557 * 0.42084) 63.48
//                         const correctedY1 = height - (y1); // 841.68 - (1544 * 0.42084)  69.97 
                    
//                         const ocrPageWidth = page_width; // Assuming OCR used a 1000px width (adjust if different)
//                         const scaleFactorX = width / ocrPageWidth;

//                         const correctedX0 = x0;
//                         const correctedX1 = x1;
//                         console.log(correctedX0, correctedX1, correctedY0, correctedY1)



//                         const padding = 2;
//                         const rectHeight = ((y1 - y0)) + padding * 2;

//                         page.drawRectangle({
//                             x: correctedX0 - padding,
//                             y: correctedY1 - padding, // Adjusted to always extend upwards
//                             width: (correctedX1 - correctedX0) + padding * 2,
//                             height: rectHeight, // Negative height to ensure upward direction
//                             color: rgb(1, 1, 1),
//                         });


//                     }
//                 }
        
//         }
        

//         const Qrpage = await pdfDocument.getPage(i + 1);
//         // Your chosen scale factor
//         const s = 4.0;
//         const viewport = Qrpage.getViewport({ scale: s });

//         const canvas = createCanvas(viewport.width, viewport.height);
//         const context = canvas.getContext('2d');

//         const renderContext = {
//             canvasContext: context,
//             viewport: viewport,
//         };

//         await Qrpage.render(renderContext).promise;

//         // After rendering the page onto the canvas:
//         thresholdImage(context);

//         const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
//         const qrCode = jsQR(imageData.data, imageData.width, imageData.height);

//         if (qrCode) {
//             // console.log(qrCode)
//             console.log(`🔍 QR code found on page ${i + 1}:`);


//             // ... after detecting QR code in the scaled canvas ...
//             const topLeft = qrCode.location.topLeftCorner;
//             const bottomRight = qrCode.location.bottomRightCorner;

//             const xScaled = topLeft.x;
//             const yScaled = topLeft.y;
//             const wScaled = Math.abs(bottomRight.x - topLeft.x);
//             const hScaled = Math.abs(bottomRight.y - topLeft.y);

//             // Convert scaled coords -> PDF coords
//             const xPdf = xScaled / s;
//             const wPdf = wScaled / s;
//             const hPdf = hScaled / s;

//             // For the Y-axis, PDF is bottom-left, so flip:
//             const pdfPage = pdfDoc.getPages()[i];
//             const pdfHeight = pdfPage.getHeight();  // page height in PDF coords
//             // Move from top-left (canvas) to bottom-left (PDF):
//             const yPdf = pdfHeight - (yScaled / s) - hPdf;

//             // Draw your rectangle in the PDF coordinate space
//             const padding = 2;
//             pdfPage.drawRectangle({
//                 x: xPdf - padding,
//                 y: yPdf - padding,
//                 width: wPdf + padding * 2,
//                 height: hPdf + padding * 2,
//                 color: rgb(1, 1, 1), // Red, just for testing
//             });

//             console.log(`✅ QR code covered on page ${i + 1}`);
//         } else {
//             console.log(`ℹ️ No QR code found on page ${i + 1}`);
//         }
//     }

//     const coverImageBytes = fs.readFileSync(coverImagePath);
//     const coverImage = await pdfDoc.embedPng(coverImageBytes);
//     const coverPage = pdfDoc.addPage([added_width, added_height]);
//     coverPage.drawImage(coverImage, { x: 0, y: 0, width: added_width, height: added_height });

//     pdfDoc.removePage(pdfDoc.getPageCount() - 1);
//     pdfDoc.insertPage(0, coverPage);

//     const pdfBytes = await pdfDoc.save();
//     fs.writeFileSync(outputPdfPath, pdfBytes);
//     console.log(`✅ Modified PDF saved as ${outputPdfPath}`);
// }


function combineBoundingBoxes(words) {
    // x0 = min of all x0
    // y0 = min of all y0
    // x1 = max of all x1
    // y1 = max of all y1
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let pageWidth = words[0].page_width;
    let pageHeight = words[0].page_height;
  
    for (const w of words) {
      const { x0, y0, x1, y1 } = w.bbox;
      if (x0 < minX) minX = x0;
      if (y0 < minY) minY = y0;
      if (x1 > maxX) maxX = x1;
      if (y1 > maxY) maxY = y1;
    }
  
    return {
      x0: minX,
      y0: minY,
      x1: maxX,
      y1: maxY,
      pageWidth,
      pageHeight
    };
  }

  
  function drawRedaction(page, pdfWidth, pdfHeight, box) {
    // If your OCR was done on a certain dimension, adjust if needed
    // But let's assume 1:1 for simplicity:
  
    const padding = 2;
    const x = box.x0 - padding;
    const width = (box.x1 - box.x0) + padding * 2;
  
    // PDF coordinate system has origin at bottom-left
    // If the OCR origin is top-left, you invert Y
    const y = pdfHeight - box.y1 - padding;
    const height = (box.y1 - box.y0) + padding * 2;
  
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: rgb(1, 1, 1) // White fill
    });
  }

  function findPhraseMatches(ocrWords, phrase) {
    const phraseTokens = phrase.split(/\s+/); // ["omega", "digital", "the", "best"]
    const matches = [];
    const totalWords = ocrWords.length;
    const phraseLen = phraseTokens.length;
  
    for (let i = 0; i <= totalWords - phraseLen; i++) {
      let match = true;
      for (let j = 0; j < phraseLen; j++) {
        // Compare text in lower case
        if (
          ocrWords[i + j].text.toLowerCase() !== phraseTokens[j].toLowerCase()
        ) {
          match = false;
          break;
        }
      }
  
      if (match) {
        // We found a consecutive match
        const matchedWords = ocrWords.slice(i, i + phraseLen);
        matches.push(matchedWords);
        // Move i forward so we don't re-check overlapping tokens
        i += phraseLen - 1;
      }
    }
    return matches;
  }
  


async function modifyPdf(inputPdfPath, outputPdfPath, coverImagePath, phrases) {
    const existingPdfBytes = fs.readFileSync(inputPdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
  
    // OCR the entire PDF (your method returns array of pages, each with words)
    const ocrResults = await ocrExtractText(existingPdfBytes);

    const pdfData = new Uint8Array(fs.readFileSync(inputPdfPath));
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdfDocument = await loadingTask.promise;
    
    let added_width
    let added_height
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      const page = pdfDoc.getPage(i);
      const { width, height } = page.getSize();
      if(i == 0) {
        added_height= height
        added_width = width
      }    

  
      // The OCR result for page i
      const ocrPageData = ocrResults[i];
      if (!ocrPageData) continue; // No OCR for this page?
  
      // We'll search each phrase in the array
      for (const phrase of phrases) {
        // Find all consecutive matches for "phrase"
        const matches = findPhraseMatches(ocrPageData.words, phrase);
        if (matches.length > 0) {
          console.log(`Page ${i + 1}: Found phrase "${phrase}" ${matches.length} time(s).`);
          // For each match, combine bounding boxes
          for (const matchWords of matches) {
            const box = combineBoundingBoxes(matchWords);
            drawRedaction(page, width, height, box);
          }
        }
      }


      const Qrpage = await pdfDocument.getPage(i + 1);
        // Your chosen scale factor
        const s = 4.0;
        const viewport = Qrpage.getViewport({ scale: s });

        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        const renderContext = {
            canvasContext: context,
            viewport: viewport,
        };

        await Qrpage.render(renderContext).promise;

        // After rendering the page onto the canvas:
        thresholdImage(context);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height);

        if (qrCode) {
            // console.log(qrCode)
            console.log(`🔍 QR code found on page ${i + 1}:`, qrCode.location);


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
            const pdfPage = pdfDoc.getPages()[i];
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

            console.log(`✅ QR code covered on page ${i + 1}`);
        } else {
            console.log(`ℹ️ No QR code found on page ${i + 1}`);
        }
    }
  
    const coverImageBytes = fs.readFileSync(coverImagePath);
    const coverImage = await pdfDoc.embedPng(coverImageBytes);
    const coverPage = pdfDoc.addPage([added_width, added_height]);
    coverPage.drawImage(coverImage, { x: 0, y: 0, width: added_width, height: added_height });

    pdfDoc.removePage(pdfDoc.getPageCount() - 1);
    pdfDoc.insertPage(0, coverPage);

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPdfPath, pdfBytes);
    console.log(`✅ Modified PDF saved as ${outputPdfPath}`);
  }

//   const SENSITIVE_PHRASES = [
//     "Adress : Dudullu Organize Sanayi Bölgesi 2. Cadde No : 10 Ümraniye - İstanbul",
//     "Telephone : +90 216 266 32 80",
//     "Fax : +90 216 266 32 99",
//     "E - mail : info@omegamotor.com.tr",
//     "www.omegamotor.com.tr"
//   ];

// modifyPdf("3M0SA3E-09LK21CT0 3.pdf", "output.pdf", "cover_page.png", SENSITIVE_PHRASES);