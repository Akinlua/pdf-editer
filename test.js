const fs = require('fs');
const axios = require('axios');
const { createCanvas, loadImage} = require('canvas');
const { PDFDocument, rgb } = require('pdf-lib');
const jsQR = require('jsqr');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');
const puppeteer = require('puppeteer-core'); // Use Puppeteer Core
const { match } = require('assert');
// Define the path to your Chromium or Chrome executable
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'; // Update this path


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
        ]
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
// processProducts().catch(console.error);

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
      data[i + 3] = 255; // Alpha (fully opaque)
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
    // formData.append('files', Buffer.from(pdfBuffer));

    const response = await axios.post('http://127.0.0.1:4000/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });

    console.log("collected")
    if (response.data.success) {
      return {
          ocrResults: response.data.success.flatMap(result => result.pages).map(page => ({
              text: page.text,
              words: page.words,
              page_height: page.page_height,
              page_width: page.page_width,
          })),
          qrResults: response.data.success[0].allqrResults // Extract QR results from the response
      };
  } else {
      throw new Error('OCR extraction failed');
  }
}


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

  
  function drawRedaction(page, pdfWidth, pdfHeight, box, divide=2, backgroundColor ) {
    // If your OCR was done on a certain dimension, adjust if needed
    // But let's assume 1:1 for simplicity:
  
    const padding = 3;
    const x = (box.x0)/divide - padding;
    const width = (box.x1 - box.x0)/divide + padding * 2;
  
    // PDF coordinate system has origin at bottom-left
    // If the OCR origin is top-left, you invert Y
    const y = pdfHeight - (box.y1)/divide - padding;
    const height = (box.y1 - box.y0)/divide + padding * 2;
  
    // Sample the surrounding area to determine background color
    // We'll use a slightly larger area around the box to sample from
     // Use the provided background color or fallback to light gray
    const color = backgroundColor || rgb(0.95, 0.95, 0.95);
    console.log("COLOR")
    console.log(color)
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: color // Use the detected surrounding color
    });
  }

  async function getSurroundingColor(pdfPath, pageNumber, box, divide = 2) {
    // Set up the PDF.js worker
    const pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
    
    // Load the PDF document
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDocument = await loadingTask.promise;
    
    // Get the specific page
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });
    
    // Create a canvas with the page dimensions
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    // Render the PDF page to the canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    // Define the area to sample (around the box, not inside it)
    const x = Math.floor(box.x0 / divide);
    const y = Math.floor(box.y0 / divide);
    const width = Math.floor((box.x1 - box.x0) / divide);
    const height = Math.floor((box.y1 - box.y0) / divide);
    
    // Define sampling points around the box
    const sampleSize = 5; // Size of the sampling area
    const samplingPoints = [
      // Top edge
      { x: x, y: y - sampleSize, width: width, height: sampleSize },
      // Bottom edge
      { x: x, y: y + height, width: width, height: sampleSize },
      // Left edge
      { x: x - sampleSize, y: y, width: sampleSize, height: height },
      // Right edge
      { x: x + width, y: y, width: sampleSize, height: height }
    ];
    
    // Filter out areas that are outside the page boundaries
    const validSamplingAreas = samplingPoints.filter(area => 
      area.x >= 0 && area.x + area.width <= viewport.width &&
      area.y >= 0 && area.y + area.height <= viewport.height
    );
    
    // If no valid sampling areas, use a default color
    if (validSamplingAreas.length === 0) {
      return { type: 'RGB', red: 1, green: 1, blue: 1 }; // White
    }
    
    // Collect color samples from all valid areas
    let colorSamples = [];
    for (const area of validSamplingAreas) {
      const imageData = context.getImageData(area.x, area.y, area.width, area.height);
      const pixels = imageData.data;
      
      // Process pixels in the area
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i] / 255;
        const g = pixels[i + 1] / 255;
        const b = pixels[i + 2] / 255;
        const a = pixels[i + 3] / 255;
        
        // Only include non-transparent pixels
        if (a > 0.5) {
          colorSamples.push({ r, g, b });
        }
      }
    }
    
    // If no valid color samples, use a default color
    if (colorSamples.length === 0) {
      return { type: 'RGB', red: 1, green: 1, blue: 1 }; // White
    }
    
    // Use a histogram approach to find the most common color
    const colorBuckets = {};
    const bucketPrecision = 0.05; // Adjust this for color precision
    
    colorSamples.forEach(color => {
      // Round colors to reduce the number of buckets
      const roundedR = Math.round(color.r / bucketPrecision) * bucketPrecision;
      const roundedG = Math.round(color.g / bucketPrecision) * bucketPrecision;
      const roundedB = Math.round(color.b / bucketPrecision) * bucketPrecision;
      
      const colorKey = `${roundedR},${roundedG},${roundedB}`;
      colorBuckets[colorKey] = (colorBuckets[colorKey] || 0) + 1;
    });
    
    // Find the most common color
    let mostCommonColor = null;
    let maxCount = 0;
    
    for (const [colorKey, count] of Object.entries(colorBuckets)) {
      if (count > maxCount) {
        maxCount = count;
        const [r, g, b] = colorKey.split(',').map(Number);
        mostCommonColor = { r, g, b };
      }
    }
    
    // Convert to PDF-lib RGB color format
    return {
      type: 'RGB',
      red: mostCommonColor.r,
      green: mostCommonColor.g,
      blue: mostCommonColor.b
    };
  }
  
  // Helper function to create PDF-lib RGB color
  function rgb_(r, g, b) {
    return { type: 'RGB', red: r, green: g, blue: b };
  }

  function findPhraseMatches(ocrWords, phrase, options = {}) {
    // Default options
    const {
      similarityThreshold = 0.7, // How similar words need to be (0-1)
      allowSkippedWords = true,  // Allow skipping a word in the phrase
      maxSkips = 1,              // Maximum words that can be skipped
      allowPartialWords = true,  // Match partial words (for split words)
      partialMatchThreshold = 0.8 // Threshold for partial word matching
    } = options;
    
    // Helper function to calculate string similarity (Levenshtein distance based)
    function stringSimilarity(s1, s2) {
      if (s1 === s2) return 1.0; // Exact match
      
      // Convert to lowercase for comparison
      s1 = s1.toLowerCase();
      s2 = s2.toLowerCase();
      
      // Calculate Levenshtein distance
      const track = Array(s2.length + 1).fill(null).map(() => 
        Array(s1.length + 1).fill(null));
      
      for (let i = 0; i <= s1.length; i++) track[0][i] = i;
      for (let j = 0; j <= s2.length; j++) track[j][0] = j;
      
      for (let j = 1; j <= s2.length; j++) {
        for (let i = 1; i <= s1.length; i++) {
          const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
          track[j][i] = Math.min(
            track[j][i - 1] + 1, // deletion
            track[j - 1][i] + 1, // insertion
            track[j - 1][i - 1] + indicator // substitution
          );
        }
      }
      
      const distance = track[s2.length][s1.length];
      const maxLength = Math.max(s1.length, s2.length);
      
      // Return similarity score (1 - normalized distance)
      return 1 - distance / maxLength;
    }
    
    // Try to match with consecutive words first
    const phraseTokens = phrase.toLowerCase().split(/\s+/);
    const matches = [];
    const totalWords = ocrWords.length;
    const phraseLen = phraseTokens.length;
    
    // Track best matches for partial matching
    let partialMatches = [];
    
    // Find matches with various degrees of fuzziness
    for (let i = 0; i <= totalWords - 1; i++) {
      let matchQuality = 0;
      let matchedWords = [];
      let phraseIndex = 0;
      let skippedWords = 0;
      
      for (let j = i; j < totalWords && phraseIndex < phraseLen; j++) {
        const currentWord = ocrWords[j].text.toLowerCase();
        const currentPhraseWord = phraseTokens[phraseIndex];
        const similarity = stringSimilarity(currentWord, currentPhraseWord);
        
        if (similarity >= similarityThreshold) {
          // Good enough match for this word
          matchedWords.push(ocrWords[j]);
          matchQuality += similarity;
          phraseIndex++;
        } 
        // Check if this word might be a partial match (split word)
        else if (allowPartialWords) {
          // Try to combine with next word if available
          if (j < totalWords - 1) {
            const combinedWord = currentWord + ocrWords[j + 1].text.toLowerCase();
            const combinedSimilarity = stringSimilarity(combinedWord, currentPhraseWord);
            
            if (combinedSimilarity >= partialMatchThreshold) {
              matchedWords.push(ocrWords[j]);
              matchedWords.push(ocrWords[j + 1]);
              matchQuality += combinedSimilarity;
              phraseIndex++;
              j++; // Skip the next word as we've used it
            }
            else if (allowSkippedWords && skippedWords < maxSkips) {
              // Skip this word and try the next one
              skippedWords++;
            }
            else {
              break; // No match found
            }
          }
          else if (allowSkippedWords && skippedWords < maxSkips) {
            // Skip this word and try the next one
            skippedWords++;
          }
          else {
            break; // No match found
          }
        }
        else if (allowSkippedWords && skippedWords < maxSkips) {
          // Skip this word and try the next one
          skippedWords++;
        }
        else {
          break; // No match found
        }
      }
      
      // Check if we've matched all words in the phrase
      if (phraseIndex === phraseLen) {
        // Normalize match quality
        const normalizedQuality = matchQuality / phraseLen;
        
        if (normalizedQuality >= similarityThreshold) {
          matches.push({
            words: matchedWords,
            confidence: normalizedQuality,
            skippedWords: skippedWords
          });
          
          // Skip ahead to avoid overlapping matches
          i += matchedWords.length - 1;
        }
      }
      // Store partial matches for consideration
      else if (phraseIndex > phraseLen / 2) {
        partialMatches.push({
          words: matchedWords,
          confidence: matchQuality / phraseIndex,
          matched: phraseIndex,
          total: phraseLen,
          startIndex: i
        });
      }
    }
    
    // If no complete matches found, consider returning best partial matches
    if (matches.length === 0 && partialMatches.length > 0) {
      // Sort by confidence and percentage matched
      partialMatches.sort((a, b) => {
        const aScore = a.confidence * (a.matched / a.total);
        const bScore = b.confidence * (b.matched / b.total);
        return bScore - aScore;
      });
      
      // Return the best partial match if it's good enough
      if (partialMatches[0].confidence >= similarityThreshold &&
          partialMatches[0].matched >= phraseLen * 0.7) {
        matches.push({
          words: partialMatches[0].words,
          confidence: partialMatches[0].confidence,
          partial: true,
          matchedWords: partialMatches[0].matched,
          totalWords: phraseLen
        });
      }
    }
    
    return matches;
  }

  function findPhraseMatches2(ocrWords, phrase) {
    const phraseTokens = phrase.split(/\s+/); // ["omega", "digital", "the", "best"]
    const matches = [];
    const totalWords = ocrWords.length;
    const phraseLen = phraseTokens.length;
  
    for (let i = 0; i <= totalWords - phraseLen; i++) {
      let match = true;
      for (let j = 0; j < phraseLen; j++) {
        // // Compare text in lower case
        // console.log(ocrWords[i + j].text.toLowerCase(), "||||", phraseTokens[j].toLowerCase())
        // console.log(ocrWords[i + j].text.toLowerCase() == phraseTokens[j].toLowerCase())
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
  // console.log(pdfDoc.)

  // OCR the entire PDF and fetch QR code results in parallel
  const { ocrResults, qrResults } = await ocrExtractText(existingPdfBytes); // Updated to destructure results
  console.log("DONE")
  // console.log(ocrResults)
  // console.log(qrResults)

  const pdfData = new Uint8Array(fs.readFileSync(inputPdfPath));
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdfDocument = await loadingTask.promise;
  
  
  let added_width;
  let added_height;
  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      const page = pdfDoc.getPage(i);
      const { width, height } = page.getSize();
      if (i == 0) {
          added_height = height;
          added_width = width;
      }    

      // The OCR result for page i
      const ocrPageData = ocrResults[i];
      if (!ocrPageData) continue; // No OCR for this page?

      // Draw rectangles for OCR matches
      // console.log(ocrPageData.words)
      for (const phrase of phrases) {
          const matches = findPhraseMatches2(ocrPageData.words, phrase);
          if (matches.length > 0) {
              console.log(`Page ${i + 1}: Found phrase "${phrase}" ${matches.length} time(s).`);
              for (const matchWords of matches) {
                // console.log(matchWords)
                  const box = combineBoundingBoxes(matchWords);   
                  
                  // Get the surrounding color
                  const backgroundColor = await getSurroundingColor(inputPdfPath, i + 1, box, 2);
                  console.log(`Detected background color: R=${backgroundColor.red.toFixed(2)}, G=${backgroundColor.green.toFixed(2)}, B=${backgroundColor.blue.toFixed(2)}`);

                  
                  // Pass the background color to drawRedaction
                  drawRedaction(page, width, height, box, 2, backgroundColor);
              }
          }
      }

      // Draw rectangles for QR results
      const qrPageData = qrResults.filter(qr => qr.page === (i + 1)); // Filter QR results for the current page
      for (const qr of qrPageData) {
          const box = {
              x0: qr.bbox.x1,
              y0: qr.bbox.y1,
              x1: qr.bbox.x2,
              y1: qr.bbox.y2
          };
          const backgroundColor = await getSurroundingColor(inputPdfPath, i + 1, box, 2);
          // const backgroundColor = rgb(0.9, 0.9, 0.9)
          console.log(`Detected Qr background color: R=${backgroundColor.red.toFixed(2)}, G=${backgroundColor.green.toFixed(2)}, B=${backgroundColor.blue.toFixed(2)}`);
          await drawRedaction(page, width, height, box, 2, backgroundColor);
      }
  }

  const coverImageBytes = fs.readFileSync(coverImagePath);
  const coverImage = await pdfDoc.embedPng(coverImageBytes);
  console.log(added_width, added_height)
  if(added_height < added_width) {
    added_width = 1190
    added_height = 1684
  }
  const coverPage = pdfDoc.addPage([added_width, added_height]);
  coverPage.drawImage(coverImage, { x: 0, y: 0, width: added_width, height: added_height });
  pdfDoc.removePage(pdfDoc.getPageCount() - 1);
  pdfDoc.insertPage(0, coverPage);

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPdfPath, pdfBytes);
  console.log(`✅ Modified PDF saved as ${outputPdfPath}`);
}

// New function to fetch QR results
async function fetchQrResults(pdfBuffer) {
  const formData = new FormData();
  formData.append('file', Buffer.from(pdfBuffer));

  const response = await axios.post('http://194.31.150.41:3001/extract_qr', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
  });

  if (response.data) {
      return response.data; // Return the QR results
  } else {
      throw new Error('QR extraction failed');
  }
}


  const SENSITIVE_PHRASES = [
    "Adress : Dudullu Organize Sanayi Bölgesi 2. Cadde No : 10 Ümraniye - İstanbul",
    "Telephone : +90 216 266 32 80",
    "Fax : +90 216 266 32 99",
    "E - mail : info@omegamotor.com.tr",
    "www.omegamotor.com.tr",
    "TECHNICAL DATASHEET",
    "Ω OMEGA MOTOR",
    "OMEGA Motor Sanayi A.Ş.'nin izni olmadan üçüncü şahıslara verilemez . OMEGA imzalı ve mühürlü olmayan resimler geçersizdir . Bütün hakları saklı ve gizlidir ."
  ];

modifyPdf("./A-90L-B35-T.pdf", "output.pdf", "cover_page.png", SENSITIVE_PHRASES);
// console.log("izni"=="izni")


// OMEGA Motor Sanayi A.Ş.'nin izni olmadan üçüncü şahıslara verilemez . OMEGA imzalı ve mühürlü olmayan resimler geçersizdir . Bütün hakları saklı ve gizlidir .