const fs = require('fs');
const axios = require('axios');
const { createCanvas } = require('canvas');
const { PDFDocument, rgb } = require('pdf-lib');
const jsQR = require('jsqr');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');
const puppeteer = require('puppeteer-core'); // Use Puppeteer Core

// Define the path to your Chromium or Chrome executable
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'; // Update this path


// Define product links and sensitive texts
const products = [
    {
        link: "https://www.omegamotor.com.tr/en/product/detail/524",
        sensitiveText: "www.omegamotor.com.tr Adress : Dudullu Organize Sanayi Bölgesi 2. Cadde No : 10 Ümraniye - İstanbul Telephone : +90 216 266 32 80 Fax : +90 216 266 32 99 E - mail : info@omegamotor.com.tr"
    },
];

// Function to fetch PDF links from a product page using Puppeteer Core
async function fetchPdfLinks(productLink) {
    const browser = await puppeteer.launch({ executablePath: CHROME_PATH }); // Specify the executable path
    const page = await browser.newPage();
    await page.goto(productLink, { waitUntil: 'networkidle2', timeout: 30000000 });
    console.log(`Navigated to ${productLink}`)

    const pdfLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href$=".pdf"]'));
        return links.map(link => link.href);
    });

    console.log(pdfLinks)
    await browser.close();
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

    for (const product of products) {
        const pdfLinks = await fetchPdfLinks(product.link);
        console.log(`Downloading PDFs for ${product.link}:`, pdfLinks);
        for (const pdfLink of pdfLinks) {
            const pdfFileName = path.basename(pdfLink);
            const pdfFilePath = path.join(downloadDir, pdfFileName); // Ensure this directory exists
            const outputPdfPath = path.join(outputDir, pdfFileName); // Define output PDF path

            await downloadPdf(pdfLink, pdfFilePath);
            await modifyPdf(pdfFilePath, outputPdfPath, 'cover_page.png', product.sensitiveText);
        }
    }
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

async function modifyPdf(inputPdfPath, outputPdfPath, coverImagePath, sensitiveText) {
    const sensitiveWords = sensitiveText.split(/\s+/); // Split into words based on OCR splitting logic
    console.log(sensitiveWords)
    
    const existingPdfBytes = fs.readFileSync(inputPdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pagesText = await extractTextFromPdf(inputPdfPath);
    const ocrResults = await ocrExtractText(existingPdfBytes);


    const pdfData = new Uint8Array(fs.readFileSync(inputPdfPath));
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdfDocument = await loadingTask.promise;
    // const QrpdfDoc = await PDFDocument.load(pdfData);

   
    let added_width
    let added_height
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
        const page = pdfDoc.getPage(i);
        const { width, height } = page.getSize();
        if(i == 0) {
            added_height= height
            added_width = width
        }    

        // sensitiveTexts.forEach(text => {
        for (const text of sensitiveWords) {
            console.log("checking......")
                const ocrPageData = ocrResults[i];
                if (ocrPageData && ocrPageData.text.includes(text)) {
                    console.log(`OCR found '${text}' on page ${i + 1}, applying redaction...`);
                    const word = ocrPageData.words.find(w => w.text.includes(text));
                    if (word && word.bbox) {
                        const { x0, x1, y0, y1 } = word.bbox;
                        const page_width = word.page_width
                        const page_height = word.page_height

                        console.log(page_width, page_height)
                        console.log(word.bbox)
                        console.log(`Page height: ${height}, OCR y0: ${y0}, y1: ${y1}`);
                        
                        const ocrPageHeight = page_height;
                        const scaleFactor = height / ocrPageHeight;
                        console.log(`OCR PAGE HEIGHT ${ocrPageHeight}`)


                        const correctedY0 = height - (y0); // 841.68 - (1557 * 0.42084) 63.48
                        const correctedY1 = height - (y1); // 841.68 - (1544 * 0.42084)  69.97 
                    
                        const ocrPageWidth = page_width; // Assuming OCR used a 1000px width (adjust if different)
                        const scaleFactorX = width / ocrPageWidth;

                        const correctedX0 = x0;
                        const correctedX1 = x1;
                        console.log(correctedX0, correctedX1, correctedY0, correctedY1)



                        const padding = 2;
                        const rectHeight = ((y1 - y0)) + padding * 2;

                        page.drawRectangle({
                            x: correctedX0 - padding,
                            y: correctedY1 - padding, // Adjusted to always extend upwards
                            width: (correctedX1 - correctedX0) + padding * 2,
                            height: rectHeight, // Negative height to ensure upward direction
                            color: rgb(1, 1, 1),
                        });


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
