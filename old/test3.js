const fs = require('fs');
const axios = require('axios');
const { createCanvas } = require('canvas');
const { PDFDocument, rgb } = require('pdf-lib');

let sensitiveText = "www.omegamotor.com.tr"; // Changed from array to string

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
            words: page.words, // Assuming Google Document AI returns words as split in OCR
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

    const sensitiveWords = sensitiveText.split(/\s+/); // Split into words based on OCR splitting logic

    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
        const page = pdfDoc.getPage(i);
        const { width, height } = page.getSize();

        const ocrPageData = ocrResults[i];
        if (ocrPageData) {
            sensitiveWords.forEach(wordToCheck => {
                const matchingWord = ocrPageData.words.find(w => w.text === wordToCheck);
                if (matchingWord && matchingWord.bbox) {
                    console.log(`OCR found '${wordToCheck}' on page ${i + 1}, applying redaction...`);
                    const { x0, x1, y0, y1 } = matchingWord.bbox;
                    const scaleFactorX = width / ocrPageData.page_width;
                    const scaleFactorY = height / ocrPageData.page_height;

                    const correctedX0 = x0 * scaleFactorX;
                    const correctedY1 = height - (y1 * scaleFactorY);

                    page.drawRectangle({
                        x: correctedX0 - 5,
                        y: correctedY1 - 5,
                        width: (x1 - x0) * scaleFactorX + 10,
                        height: (y1 - y0) * scaleFactorY + 10,
                        color: rgb(1, 1, 1),
                    });
                }
            });
        }
    }

    const coverImageBytes = fs.readFileSync(coverImagePath);
    const coverImage = await pdfDoc.embedPng(coverImageBytes);
    const coverPage = pdfDoc.addPage([coverImage.width, coverImage.height]);
    coverPage.drawImage(coverImage, { x: 0, y: 0, width: coverImage.width, height: coverImage.height });

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
