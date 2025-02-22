const fs = require('fs');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const { PDFDocument, rgb } = require('pdf-lib');
const path = require("path");

const sensitiveTexts = ["www.omegamotor.com.tr"]; // Add more patterns

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

async function renderPageToImage(pdfPath, pageNum) {
    const pdfjsLib = require('pdfjs-dist');
    const loadingTask = pdfjsLib.getDocument(pdfPath);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNum);

    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    const renderContext = {
        canvasContext: context,
        viewport: viewport,
    };

    await page.render(renderContext).promise;
    return canvas.toBuffer('image/png');
}

async function ocrExtractText(imageBuffer) {
    const formData = new FormData();
    formData.append('files', new Blob([imageBuffer], { type: 'image/png' }));

    const response = await axios.post('http://localhost:4000/api/upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });

    if (response.data.success) {
        return response.data.success.flatMap(result => result.pages).map(page => ({
            text: page.text,
            words: page.words,
        }));
    } else {
        throw new Error('OCR extraction failed');
    }
}

async function modifyPdf(inputPdfPath, outputPdfPath, coverImagePath) {
    const existingPdfBytes = fs.readFileSync(inputPdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pagesText = await extractTextFromPdf(inputPdfPath);
    
    let added_width
    let added_height
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
        const page = pdfDoc.getPage(i);
        // page.drawRectangle({
        //     x: 220,
        //     y: 75, // Adjust for PDF coordinate system
        //     width: 20,
        //     height:20,
        //     color: rgb(1, 0, 0), // White fill
        // });
        const { width, height } = page.getSize();
        if(i = 0) {
            added_height= height
            added_width = width
        }       

        // Search text normally first
        sensitiveTexts.forEach(text => {
            if (pagesText[i].includes(text)) {
                console.log(`Found '${text}' on page ${i + 1}, applying redaction...`);
                const boundingBox = getBoundingBoxForText(text, pagesText[i]); // Implement this function
                page.drawRectangle({
                    x: boundingBox.x,
                    y: height - boundingBox.y - boundingBox.height, // Adjust for PDF coordinate system
                    width: boundingBox.width,
                    height: boundingBox.height,
                    color: rgb(1, 0, ), // White fill
                });
            }
        });

        // OCR fallback for non-searchable text
        if (!sensitiveTexts.some(text => pagesText[i].includes(text))) {
            console.log(`Performing OCR on page ${i + 1}...`);
            // const imgBuffer = await renderPageToImage(inputPdfPath, i + 1);
            // const ocrResults = await ocrExtractText(imgBuffer);
            // console.log(ocrResults)


            const pdfBuffer = fs.readFileSync(inputPdfPath); // Read the PDF buffer
            const ocrResults = await ocrExtractText(pdfBuffer); // Pass the PDF buffer directly

            ocrResults.forEach(result => {
                if (result.text) {
                    sensitiveTexts.forEach(text => {
                        // if (result.text.includes(text)) {
                        //     console.log(`OCR found '${text}' on page ${i + 1}, applying redaction...`);
                        //     const boundingBox = result.words.find(word => word.text.includes(text)).bbox; // Assuming bbox is available
                        //     page.drawRectangle({
                        //         x: boundingBox.x0,
                        //         y: height - boundingBox.y0 - (boundingBox.y1 - boundingBox.y0), // Adjust for PDF coordinate system
                        //         width: boundingBox.x1 - boundingBox.x0,
                        //         height: boundingBox.y1 - boundingBox.y0,
                        //         color: rgb(1, 0, 0),
                        //     });
                        // }

                        if (result.text.includes(text)) {
                            console.log(`OCR found '${text}' on page ${i + 1}, applying redaction...`);
                            const boundingBox = result.words.find(word => word.text.includes(text)).bbox;
                            const page_height = result.words.find(word => word.text.includes(text)).page_height;
                            const page_width = result.words.find(word => word.text.includes(text)).page_width;
                            console.log(page_height, page_width)

                            console.log(boundingBox)
                            console.log(`Page height: ${height}, OCR y0: ${boundingBox.y0}, y1: ${boundingBox.y1}`);
                            

                            const ocrPageHeight = page_height;
                            const scaleFactor = height / ocrPageHeight;

                           const correctedY0 = height - (boundingBox.y0* scaleFactor); // 841.68 - (1557 * 0.42084) 63.48
                          const correctedY1 = height - (boundingBox.y1 * scaleFactor); // 841.68 - (1544 * 0.42084)  69.97 
                      
                            const ocrPageWidth = page_width; // Assuming OCR used a 1000px width (adjust if different)
                            const scaleFactorX = width / ocrPageWidth;

                            const correctedX0 = boundingBox.x0 * scaleFactorX;
                            const correctedX1 = boundingBox.x1 * scaleFactorX;
                            console.log(correctedX0, correctedX1, correctedY0, correctedY1)

                            if (boundingBox) {
                                const padding = 5;
                                page.drawRectangle({
                                    x: correctedX0 - padding,
                                    y:  correctedY1 - padding, // Adjusted for PDF coordinate system
                                    width: (correctedX1 - correctedX0) + padding * 2,
                                    height: ((boundingBox.y1 - boundingBox.y0) * scaleFactor) + padding * 2,
                                    color: rgb(1, 1, 1), // White rectangle for better blending
                                });
                            } else {
                                console.warn(`⚠️ Bounding box not found for '${text}' on page ${i + 1}`);
                            }
                        }
                    });
                }
            });
        }
    }



    // ✅ Add cover page
    const coverImageBytes = fs.readFileSync(coverImagePath);
    const coverImage = await pdfDoc.embedPng(coverImageBytes);
    const coverWidth = coverImage.width;
    const coverHeight = coverImage.height;
    const coverPage = pdfDoc.addPage([coverWidth, coverHeight]);
    coverPage.drawImage(coverImage, {
        x: 0,
        y: 0,
        width: coverWidth,
        height: coverHeight,
    });

    // Move the cover page to the first position
    const allPages = pdfDoc.getPages();
    pdfDoc.removePage(pdfDoc.getPageCount() - 1); // Remove the duplicate cover page from the end
    pdfDoc.insertPage(0, coverPage);

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPdfPath, pdfBytes);
    console.log(`✅ Modified PDF saved as ${outputPdfPath}`);
}

// Example usage
modifyPdf(
    'input_pdfs/3M0SA3E-09LK21CT0 2.pdf',
    'output_pdfs/3M0SA3E-09LK21CT0 2.pdf',
    'cover_page.png'
); 