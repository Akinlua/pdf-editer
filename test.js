const fs = require('fs');
const axios = require('axios');
const { createCanvas } = require('canvas');
const { PDFDocument, rgb } = require('pdf-lib');

const sensitiveTexts = ["www.omegamotor.com.tr"];

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

    const response = await axios.post('http://localhost:4000/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });

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

async function modifyPdf(inputPdfPath, outputPdfPath, coverImagePath) {
    const existingPdfBytes = fs.readFileSync(inputPdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pagesText = await extractTextFromPdf(inputPdfPath);
    const ocrResults = await ocrExtractText(existingPdfBytes);

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
        for (const text of sensitiveTexts) {
            console.log("checking......")
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
            } else {
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
                        
                        // const scaleFactorX = width / ocrPageData.page_width;
                        // const scaleFactorY = height / ocrPageData.page_height;

                        // const correctedX0 = x0 * scaleFactorX;
                        // const correctedY1 = height - (y1 * scaleFactorY);


                        const ocrPageHeight = page_height;
                        const scaleFactor = height / ocrPageHeight;

                        const correctedY0 = height - (y0* scaleFactor); // 841.68 - (1557 * 0.42084) 63.48
                        const correctedY1 = height - (y1 * scaleFactor); // 841.68 - (1544 * 0.42084)  69.97 
                    
                        const ocrPageWidth = page_width; // Assuming OCR used a 1000px width (adjust if different)
                        const scaleFactorX = width / ocrPageWidth;

                        const correctedX0 = x0 * scaleFactorX;
                        const correctedX1 = x1 * scaleFactorX;
                        console.log(correctedX0, correctedX1, correctedY0, correctedY1)

                        const padding = 5;
                        page.drawRectangle({
                            x: correctedX0 - padding,
                            y:  correctedY1 - padding, // Adjusted for PDF coordinate system
                            width: (correctedX1 - correctedX0) + padding * 2,
                            height: ((y1 - y0) * scaleFactor) + padding * 2,
                            color: rgb(1, 1, 1), // White rectangle for better blending
                        });

                    }
                }
            }
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

modifyPdf(
    'input_pdfs/3M0SA3E-09LK21CT0 2.pdf',
    'output_pdfs/3M0SA3E-09LK21CT0 2.pdf',
    'cover_page.png'
);
