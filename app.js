const fs = require('fs');
const axios = require('axios');
const { createCanvas } = require('canvas');
const { PDFDocument, rgb } = require('pdf-lib');
const jsQR = require('jsqr');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');
const puppeteer = require('puppeteer-core'); // Use Puppeteer Core
const nodemailer = require('nodemailer'); // Import Nodemailer  
const { Cluster } = require('puppeteer-cluster');

// Define the path to your Chromium or Chrome executable
// const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'; // Update this path
const CHROME_PATH = '/usr/bin/google-chrome'; // Update this path

// Utility function to split array into batches
function batchArray(array, batchSize) {
  const batches = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

// Define product links and sensitive texts grouped by domain
const productsByDomain = {
    "omegamotor.com.tr": {
        sensitiveText: [
            "Adress : Dudullu Organize Sanayi Bölgesi 2. Cadde No : 10 Ümraniye - İstanbul",
            "Telephone : +90 216 266 32 80",
            "Fax : +90 216 266 32 99",
            "E - mail : info@omegamotor.com.tr",
            "www.omegamotor.com.tr"
        ],
        selector: 'div.summary.entry-summary strong', // Selector for product name
        fileselector: ".shop_table.cart",
        products: [
            "https://www.omegamotor.com.tr/en/product/detail/524",
            // "https://omegamotor.com.tr/en/product/detail/390",
            // "https://omegamotor.com.tr/en/product/detail/393",
            "https://omegamotor.com.tr/en/product/detail/394",
            "https://omegamotor.com.tr/en/product/detail/391",
            "https://omegamotor.com.tr/en/product/detail/395",
            "https://omegamotor.com.tr/en/product/detail/396",
            "https://omegamotor.com.tr/en/product/detail/392",
            "https://omegamotor.com.tr/en/product/detail/397",
            "https://omegamotor.com.tr/en/product/detail/398",
            "https://omegamotor.com.tr/en/product/detail/399",
            "https://omegamotor.com.tr/en/product/detail/402",
            "https://omegamotor.com.tr/en/product/detail/400",
            "https://omegamotor.com.tr/en/product/detail/401",
            "https://omegamotor.com.tr/en/product/detail/403",
            "https://omegamotor.com.tr/en/product/detail/411",
            "https://omegamotor.com.tr/en/product/detail/412",
            "https://omegamotor.com.tr/en/product/detail/413",
            "https://omegamotor.com.tr/en/product/detail/416",
            "https://omegamotor.com.tr/en/product/detail/414",
            "https://omegamotor.com.tr/en/product/detail/415",
            "https://omegamotor.com.tr/en/product/detail/574",
            "https://omegamotor.com.tr/en/product/detail/575",
            "https://omegamotor.com.tr/en/product/detail/578",
            "https://omegamotor.com.tr/en/product/detail/585",
            "https://omegamotor.com.tr/en/product/detail/579",
            "https://omegamotor.com.tr/en/product/detail/580",
            "https://omegamotor.com.tr/en/product/detail/583",
            "https://omegamotor.com.tr/en/product/detail/581",
            "https://omegamotor.com.tr/en/product/detail/582",
            "https://omegamotor.com.tr/en/product/detail/584",
            "https://omegamotor.com.tr/en/product/detail/599",
            "https://omegamotor.com.tr/en/product/detail/595",
            "https://omegamotor.com.tr/en/product/detail/596",
            "https://omegamotor.com.tr/en/product/detail/593",
            "https://omegamotor.com.tr/en/product/detail/597",
            "https://omegamotor.com.tr/en/product/detail/598",
            "https://omegamotor.com.tr/en/product/detail/594",
            "https://omegamotor.com.tr/en/product/detail/586",
            "https://omegamotor.com.tr/en/product/detail/587",
            "https://omegamotor.com.tr/en/product/detail/588",
            "https://omegamotor.com.tr/en/product/detail/493",
            "https://omegamotor.com.tr/en/product/detail/491",
            "https://omegamotor.com.tr/en/product/detail/492",
            "https://omegamotor.com.tr/en/product/detail/494",
            "https://omegamotor.com.tr/en/product/detail/467",
            "https://omegamotor.com.tr/en/product/detail/470",
            "https://omegamotor.com.tr/en/product/detail/471",
            "https://omegamotor.com.tr/en/product/detail/468",
            "https://omegamotor.com.tr/en/product/detail/472",
            "https://omegamotor.com.tr/en/product/detail/473",
            "https://omegamotor.com.tr/en/product/detail/469",
            "https://omegamotor.com.tr/en/product/detail/460",
            "https://omegamotor.com.tr/en/product/detail/464",
            "https://omegamotor.com.tr/en/product/detail/461",
            "https://omegamotor.com.tr/en/product/detail/465",
            "https://omegamotor.com.tr/en/product/detail/462",
            "https://omegamotor.com.tr/en/product/detail/463",
            "https://omegamotor.com.tr/en/product/detail/466",
            "https://omegamotor.com.tr/en/product/detail/481",
            "https://omegamotor.com.tr/en/product/detail/482",
            "https://omegamotor.com.tr/en/product/detail/483",
            "https://omegamotor.com.tr/en/product/detail/486",
            "https://omegamotor.com.tr/en/product/detail/484",
            "https://omegamotor.com.tr/en/product/detail/485",
            "https://omegamotor.com.tr/en/product/detail/487",
            "https://omegamotor.com.tr/en/product/detail/515",
            "https://omegamotor.com.tr/en/product/detail/509",
            "https://omegamotor.com.tr/en/product/detail/510",
            "https://omegamotor.com.tr/en/product/detail/513",
            "https://omegamotor.com.tr/en/product/detail/511",
            "https://omegamotor.com.tr/en/product/detail/512",
            "https://omegamotor.com.tr/en/product/detail/514",
            "https://omegamotor.com.tr/en/product/detail/497",
            "https://omegamotor.com.tr/en/product/detail/498",
            "https://omegamotor.com.tr/en/product/detail/499",
            "https://omegamotor.com.tr/en/product/detail/495",
            "https://omegamotor.com.tr/en/product/detail/500",
            "https://omegamotor.com.tr/en/product/detail/501",
            "https://omegamotor.com.tr/en/product/detail/496",
            "https://omegamotor.com.tr/en/product/detail/516",
            "https://omegamotor.com.tr/en/product/detail/550",
            "https://omegamotor.com.tr/en/product/detail/546",
            "https://omegamotor.com.tr/en/product/detail/547",
            "https://omegamotor.com.tr/en/product/detail/544",
            "https://omegamotor.com.tr/en/product/detail/548",
            "https://omegamotor.com.tr/en/product/detail/549",
            "https://omegamotor.com.tr/en/product/detail/545",
            "https://omegamotor.com.tr/en/product/detail/523",
            "https://omegamotor.com.tr/en/product/detail/527",
            "https://omegamotor.com.tr/en/product/detail/524",
            "https://omegamotor.com.tr/en/product/detail/528",
            "https://omegamotor.com.tr/en/product/detail/525",
            "https://omegamotor.com.tr/en/product/detail/526",
            "https://omegamotor.com.tr/en/product/detail/529",
            "https://omegamotor.com.tr/en/product/detail/536",
            "https://omegamotor.com.tr/en/product/detail/530",
            "https://omegamotor.com.tr/en/product/detail/531",
            "https://omegamotor.com.tr/en/product/detail/534",
            "https://omegamotor.com.tr/en/product/detail/532",
            "https://omegamotor.com.tr/en/product/detail/533",
            "https://omegamotor.com.tr/en/product/detail/442",
            "https://omegamotor.com.tr/en/product/detail/443",
            "https://omegamotor.com.tr/en/product/detail/445",
            "https://omegamotor.com.tr/en/product/detail/453",
            "https://omegamotor.com.tr/en/product/detail/454",
            "https://omegamotor.com.tr/en/product/detail/455",
            "https://omegamotor.com.tr/en/product/detail/458",
            "https://omegamotor.com.tr/en/product/detail/456",
            "https://omegamotor.com.tr/en/product/detail/457",
            "https://omegamotor.com.tr/en/product/detail/459",
            "https://omegamotor.com.tr/en/product/detail/474",
            "https://omegamotor.com.tr/en/product/detail/475",
            "https://omegamotor.com.tr/en/product/detail/476",
            "https://omegamotor.com.tr/en/product/detail/479",
            "https://omegamotor.com.tr/en/product/detail/477",
            "https://omegamotor.com.tr/en/product/detail/478",
            "https://omegamotor.com.tr/en/product/detail/480",
            "https://omegamotor.com.tr/en/product/detail/488",
            "https://omegamotor.com.tr/en/product/detail/489",
            "https://omegamotor.com.tr/en/product/detail/490",
            "https://omegamotor.com.tr/en/product/detail/517",
            "https://omegamotor.com.tr/en/product/detail/518",
            "https://omegamotor.com.tr/en/product/detail/521",
            "https://omegamotor.com.tr/en/product/detail/519",
            "https://omegamotor.com.tr/en/product/detail/520",
            "https://omegamotor.com.tr/en/product/detail/522",
            "https://omegamotor.com.tr/en/product/detail/502",
            "https://omegamotor.com.tr/en/product/detail/503",
            "https://omegamotor.com.tr/en/product/detail/504",
            "https://omegamotor.com.tr/en/product/detail/507",
            "https://omegamotor.com.tr/en/product/detail/505",
            "https://omegamotor.com.tr/en/product/detail/506",
            "https://omegamotor.com.tr/en/product/detail/508",
            "https://omegamotor.com.tr/en/product/detail/551",
            "https://omegamotor.com.tr/en/product/detail/552",
            "https://omegamotor.com.tr/en/product/detail/553",
            "https://omegamotor.com.tr/en/product/detail/556",
            "https://omegamotor.com.tr/en/product/detail/554",
            "https://omegamotor.com.tr/en/product/detail/555",
            "https://omegamotor.com.tr/en/product/detail/557",
            "https://omegamotor.com.tr/en/product/detail/408",
            "https://omegamotor.com.tr/en/product/detail/410",
            "https://omegamotor.com.tr/en/product/detail/446",
            "https://omegamotor.com.tr/en/product/detail/449",
            "https://omegamotor.com.tr/en/product/detail/450",
            "https://omegamotor.com.tr/en/product/detail/447",
            "https://omegamotor.com.tr/en/product/detail/451",
            "https://omegamotor.com.tr/en/product/detail/452",
            "https://omegamotor.com.tr/en/product/detail/448",
            "https://omegamotor.com.tr/en/product/detail/432",
            "https://omegamotor.com.tr/en/product/detail/433",
            "https://omegamotor.com.tr/en/product/detail/434",
            "https://omegamotor.com.tr/en/product/detail/437",
            "https://omegamotor.com.tr/en/product/detail/435",
            "https://omegamotor.com.tr/en/product/detail/436",
            "https://omegamotor.com.tr/en/product/detail/438",
            "https://omegamotor.com.tr/en/product/detail/439",
            "https://omegamotor.com.tr/en/product/detail/440",
            "https://omegamotor.com.tr/en/product/detail/441",
            "https://omegamotor.com.tr/en/product/detail/444",
            "https://omegamotor.com.tr/en/product/detail/591",
            "https://omegamotor.com.tr/en/product/detail/589",
            "https://omegamotor.com.tr/en/product/detail/590",
            "https://omegamotor.com.tr/en/product/detail/592",
            "https://omegamotor.com.tr/en/product/detail/600",
            "https://omegamotor.com.tr/en/product/detail/601",
            "https://omegamotor.com.tr/en/product/detail/602",
            "https://omegamotor.com.tr/en/product/detail/605",
            "https://omegamotor.com.tr/en/product/detail/603",
            "https://omegamotor.com.tr/en/product/detail/604",
            "https://omegamotor.com.tr/en/product/detail/606",
            "https://omegamotor.com.tr/en/product/detail/621",
            "https://omegamotor.com.tr/en/product/detail/625",
            "https://omegamotor.com.tr/en/product/detail/622",
            "https://omegamotor.com.tr/en/product/detail/626",
            "https://omegamotor.com.tr/en/product/detail/623",
            "https://omegamotor.com.tr/en/product/detail/624",
            "https://omegamotor.com.tr/en/product/detail/627",
            "https://omegamotor.com.tr/en/product/detail/630",
            "https://omegamotor.com.tr/en/product/detail/631",
            "https://omegamotor.com.tr/en/product/detail/637",
            "https://omegamotor.com.tr/en/product/detail/640",
            "https://omegamotor.com.tr/en/product/detail/638",
            "https://omegamotor.com.tr/en/product/detail/639",
            "https://omegamotor.com.tr/en/product/detail/641",
            "https://omegamotor.com.tr/en/product/detail/663",
            "https://omegamotor.com.tr/en/product/detail/664",
            "https://omegamotor.com.tr/en/product/detail/665",
            "https://omegamotor.com.tr/en/product/detail/668",
            "https://omegamotor.com.tr/en/product/detail/666",
            "https://omegamotor.com.tr/en/product/detail/667",
            "https://omegamotor.com.tr/en/product/detail/669",
            "https://omegamotor.com.tr/en/product/detail/649",
            "https://omegamotor.com.tr/en/product/detail/650",
            "https://omegamotor.com.tr/en/product/detail/651",
            "https://omegamotor.com.tr/en/product/detail/654",
            "https://omegamotor.com.tr/en/product/detail/652",
            "https://omegamotor.com.tr/en/product/detail/653",
            "https://omegamotor.com.tr/en/product/detail/655",
            "https://omegamotor.com.tr/en/product/detail/691",
            "https://omegamotor.com.tr/en/product/detail/686",
            "https://omegamotor.com.tr/en/product/detail/687",
            "https://omegamotor.com.tr/en/product/detail/943",
            "https://omegamotor.com.tr/en/product/detail/676",
            "https://omegamotor.com.tr/en/product/detail/670",
            "https://omegamotor.com.tr/en/product/detail/933",
            "https://omegamotor.com.tr/en/product/detail/674",
            "https://omegamotor.com.tr/en/product/detail/672",
            "https://omegamotor.com.tr/en/product/detail/673",
            "https://omegamotor.com.tr/en/product/detail/935",
            "https://omegamotor.com.tr/en/product/detail/677",
            "https://omegamotor.com.tr/en/product/detail/678",
            "https://omegamotor.com.tr/en/product/detail/679",
            "https://omegamotor.com.tr/en/product/detail/682",
            "https://omegamotor.com.tr/en/product/detail/680",
            "https://omegamotor.com.tr/en/product/detail/681",
            "https://omegamotor.com.tr/en/product/detail/683",
            "https://omegamotor.com.tr/en/product/detail/949",
            "https://omegamotor.com.tr/en/product/detail/699",
            "https://omegamotor.com.tr/en/product/detail/700",
            "https://omegamotor.com.tr/en/product/detail/911",
            "https://omegamotor.com.tr/en/product/detail/633",
            "https://omegamotor.com.tr/en/product/detail/634",
            "https://omegamotor.com.tr/en/product/detail/909",
            "https://omegamotor.com.tr/en/product/detail/662",
            "https://omegamotor.com.tr/en/product/detail/656",
            "https://omegamotor.com.tr/en/product/detail/925",
            "https://omegamotor.com.tr/en/product/detail/660",
            "https://omegamotor.com.tr/en/product/detail/658",
            "https://omegamotor.com.tr/en/product/detail/659",
            "https://omegamotor.com.tr/en/product/detail/927",
            "https://omegamotor.com.tr/en/product/detail/648",
            "https://omegamotor.com.tr/en/product/detail/644",
            "https://omegamotor.com.tr/en/product/detail/918",
            "https://omegamotor.com.tr/en/product/detail/642",
            "https://omegamotor.com.tr/en/product/detail/646",
            "https://omegamotor.com.tr/en/product/detail/647",
            "https://omegamotor.com.tr/en/product/detail/917",
            "https://omegamotor.com.tr/en/product/detail/635",
            "https://omegamotor.com.tr/en/product/detail/636",
            "https://omegamotor.com.tr/en/product/detail/962",
            "https://omegamotor.com.tr/en/product/detail/722",
            "https://omegamotor.com.tr/en/product/detail/723",
            "https://omegamotor.com.tr/en/product/detail/964",
            "https://omegamotor.com.tr/en/product/detail/725",
            "https://omegamotor.com.tr/en/product/detail/726",
            "https://omegamotor.com.tr/en/product/detail/975",
            "https://omegamotor.com.tr/en/product/detail/743",
            "https://omegamotor.com.tr/en/product/detail/744",
            "https://omegamotor.com.tr/en/product/detail/745",
            "https://omegamotor.com.tr/en/product/detail/977",
            "https://omegamotor.com.tr/en/product/detail/732",
            "https://omegamotor.com.tr/en/product/detail/733",
            "https://omegamotor.com.tr/en/product/detail/970",
            "https://omegamotor.com.tr/en/product/detail/735",
            "https://omegamotor.com.tr/en/product/detail/736",
            "https://omegamotor.com.tr/en/product/detail/14",
            "https://omegamotor.com.tr/en/product/detail/11",
            "https://omegamotor.com.tr/en/product/detail/12",
            "https://omegamotor.com.tr/en/product/detail/15",
            "https://omegamotor.com.tr/en/product/detail/417",
            "https://omegamotor.com.tr/en/product/detail/425",
            "https://omegamotor.com.tr/en/product/detail/426",
            "https://omegamotor.com.tr/en/product/detail/427",
            "https://omegamotor.com.tr/en/product/detail/430",
            "https://omegamotor.com.tr/en/product/detail/428",
            "https://omegamotor.com.tr/en/product/detail/429",
            "https://omegamotor.com.tr/en/product/detail/431",
            "https://omegamotor.com.tr/en/product/detail/418",
            "https://omegamotor.com.tr/en/product/detail/421",
            "https://omegamotor.com.tr/en/product/detail/422",
            "https://omegamotor.com.tr/en/product/detail/419",
            "https://omegamotor.com.tr/en/product/detail/423",
            "https://omegamotor.com.tr/en/product/detail/424",
            "https://omegamotor.com.tr/en/product/detail/420",
            "https://omegamotor.com.tr/en/product/detail/404",
            "https://omegamotor.com.tr/en/product/detail/405",
            "https://omegamotor.com.tr/en/product/detail/406",
            "https://omegamotor.com.tr/en/product/detail/409",
            "https://omegamotor.com.tr/en/product/detail/407",
            "https://omegamotor.com.tr/en/product/detail/569",
            "https://omegamotor.com.tr/en/product/detail/571",
            "https://omegamotor.com.tr/en/product/detail/614",
            "https://omegamotor.com.tr/en/product/detail/615",
            "https://omegamotor.com.tr/en/product/detail/616",
            "https://omegamotor.com.tr/en/product/detail/619",
            "https://omegamotor.com.tr/en/product/detail/617",
            "https://omegamotor.com.tr/en/product/detail/618",
            "https://omegamotor.com.tr/en/product/detail/620",
            "https://omegamotor.com.tr/en/product/detail/609",
            "https://omegamotor.com.tr/en/product/detail/610",
            "https://omegamotor.com.tr/en/product/detail/903",
            "https://omegamotor.com.tr/en/product/detail/607",
            "https://omegamotor.com.tr/en/product/detail/612",
            "https://omegamotor.com.tr/en/product/detail/613",
            "https://omegamotor.com.tr/en/product/detail/901",
            "https://omegamotor.com.tr/en/product/detail/572",
            "https://omegamotor.com.tr/en/product/detail/576",
            "https://omegamotor.com.tr/en/product/detail/573",
            "https://omegamotor.com.tr/en/product/detail/577",
            "https://omegamotor.com.tr/en/product/detail/692",
            "https://omegamotor.com.tr/en/product/detail/693",
            "https://omegamotor.com.tr/en/product/detail/696",
            "https://omegamotor.com.tr/en/product/detail/694",
            "https://omegamotor.com.tr/en/product/detail/695",
            "https://omegamotor.com.tr/en/product/detail/697",
            "https://omegamotor.com.tr/en/product/detail/703",
            "https://omegamotor.com.tr/en/product/detail/704",
            "https://omegamotor.com.tr/en/product/detail/705",
            "https://omegamotor.com.tr/en/product/detail/706",
            "https://omegamotor.com.tr/en/product/detail/707",
            "https://omegamotor.com.tr/en/product/detail/4",
            "https://omegamotor.com.tr/en/product/detail/1",
            "https://omegamotor.com.tr/en/product/detail/2",
            "https://omegamotor.com.tr/en/product/detail/5",
            "https://omegamotor.com.tr/en/product/detail/3",
            "https://omegamotor.com.tr/en/product/detail/690",
            "https://omegamotor.com.tr/en/product/detail/684",
            "https://omegamotor.com.tr/en/product/detail/941",
            "https://omegamotor.com.tr/en/product/detail/688",
            "https://omegamotor.com.tr/en/product/detail/701",
            "https://omegamotor.com.tr/en/product/detail/951",
            "https://omegamotor.com.tr/en/product/detail/8",
            "https://omegamotor.com.tr/en/product/detail/6",
            "https://omegamotor.com.tr/en/product/detail/7",
            "https://omegamotor.com.tr/en/product/detail/10",
            "https://omegamotor.com.tr/en/product/detail/9",
            "https://omegamotor.com.tr/en/product/detail/714",
            "https://omegamotor.com.tr/en/product/detail/708",
            "https://omegamotor.com.tr/en/product/detail/955",
            "https://omegamotor.com.tr/en/product/detail/712",
            "https://omegamotor.com.tr/en/product/detail/710",
            "https://omegamotor.com.tr/en/product/detail/711",
            "https://omegamotor.com.tr/en/product/detail/957",
            "https://omegamotor.com.tr/en/product/detail/715",
            "https://omegamotor.com.tr/en/product/detail/716",
            "https://omegamotor.com.tr/en/product/detail/960",
            "https://omegamotor.com.tr/en/product/detail/720",
            "https://omegamotor.com.tr/en/product/detail/718",
            "https://omegamotor.com.tr/en/product/detail/719",
            "https://omegamotor.com.tr/en/product/detail/13",
            "https://omegamotor.com.tr/en/product/detail/34",
            "https://omegamotor.com.tr/en/product/detail/31",
            "https://omegamotor.com.tr/en/product/detail/32",
            "https://omegamotor.com.tr/en/product/detail/35",
            "https://omegamotor.com.tr/en/product/detail/33",
            "https://omegamotor.com.tr/en/product/detail/24",
            "https://omegamotor.com.tr/en/product/detail/21",
            "https://omegamotor.com.tr/en/product/detail/22",
            "https://omegamotor.com.tr/en/product/detail/25",
            "https://omegamotor.com.tr/en/product/detail/23",
            "https://omegamotor.com.tr/en/product/detail/727",
            "https://omegamotor.com.tr/en/product/detail/728",
            "https://omegamotor.com.tr/en/product/detail/729",
            "https://omegamotor.com.tr/en/product/detail/730",
            "https://omegamotor.com.tr/en/product/detail/731",
            "https://omegamotor.com.tr/en/product/detail/747",
            "https://omegamotor.com.tr/en/product/detail/748",
            "https://omegamotor.com.tr/en/product/detail/749",
            "https://omegamotor.com.tr/en/product/detail/750",
            "https://omegamotor.com.tr/en/product/detail/535",
            "https://omegamotor.com.tr/en/product/detail/560",
            "https://omegamotor.com.tr/en/product/detail/561",
            "https://omegamotor.com.tr/en/product/detail/895",
            "https://omegamotor.com.tr/en/product/detail/558",
            "https://omegamotor.com.tr/en/product/detail/563",
            "https://omegamotor.com.tr/en/product/detail/564",
            "https://omegamotor.com.tr/en/product/detail/893",
            "https://omegamotor.com.tr/en/product/detail/537",
            "https://omegamotor.com.tr/en/product/detail/538",
            "https://omegamotor.com.tr/en/product/detail/539",
            "https://omegamotor.com.tr/en/product/detail/542",
            "https://omegamotor.com.tr/en/product/detail/540",
            "https://omegamotor.com.tr/en/product/detail/541",
            "https://omegamotor.com.tr/en/product/detail/543",
            "https://omegamotor.com.tr/en/product/detail/565",
            "https://omegamotor.com.tr/en/product/detail/566",
            "https://omegamotor.com.tr/en/product/detail/567",
            "https://omegamotor.com.tr/en/product/detail/570",
            "https://omegamotor.com.tr/en/product/detail/568",
            "https://omegamotor.com.tr/en/product/detail/751",
            "https://omegamotor.com.tr/en/product/detail/737",
            "https://omegamotor.com.tr/en/product/detail/738",
            "https://omegamotor.com.tr/en/product/detail/739",
            "https://omegamotor.com.tr/en/product/detail/740",
            "https://omegamotor.com.tr/en/product/detail/741",
            "https://omegamotor.com.tr/en/product/detail/18",
            "https://omegamotor.com.tr/en/product/detail/16",
            "https://omegamotor.com.tr/en/product/detail/17",
            "https://omegamotor.com.tr/en/product/detail/20",
            "https://omegamotor.com.tr/en/product/detail/19",
            "https://omegamotor.com.tr/en/product/detail/38",
            "https://omegamotor.com.tr/en/product/detail/36",
            "https://omegamotor.com.tr/en/product/detail/37",
            "https://omegamotor.com.tr/en/product/detail/40",
            "https://omegamotor.com.tr/en/product/detail/39",
            "https://omegamotor.com.tr/en/product/detail/28",
            "https://omegamotor.com.tr/en/product/detail/26",
            "https://omegamotor.com.tr/en/product/detail/27",
            "https://omegamotor.com.tr/en/product/detail/30",
            "https://omegamotor.com.tr/en/product/detail/29",
            "https://omegamotor.com.tr/en/product/detail/64",
            "https://omegamotor.com.tr/en/product/detail/62",
            "https://omegamotor.com.tr/en/product/detail/63",
            "https://omegamotor.com.tr/en/product/detail/66",
            "https://omegamotor.com.tr/en/product/detail/65",
            "https://omegamotor.com.tr/en/product/detail/54",
            "https://omegamotor.com.tr/en/product/detail/52",
            "https://omegamotor.com.tr/en/product/detail/53",
            "https://omegamotor.com.tr/en/product/detail/56",
            "https://omegamotor.com.tr/en/product/detail/55",
            "https://omegamotor.com.tr/en/product/detail/46",
            "https://omegamotor.com.tr/en/product/detail/44",
            "https://omegamotor.com.tr/en/product/detail/45",
            "https://omegamotor.com.tr/en/product/detail/767",
            "https://omegamotor.com.tr/en/product/detail/768",
            "https://omegamotor.com.tr/en/product/detail/769",
            "https://omegamotor.com.tr/en/product/detail/770",
            "https://omegamotor.com.tr/en/product/detail/771",
            "https://omegamotor.com.tr/en/product/detail/757",
            "https://omegamotor.com.tr/en/product/detail/826",
            "https://omegamotor.com.tr/en/product/detail/827",
            "https://omegamotor.com.tr/en/product/detail/822",
            "https://omegamotor.com.tr/en/product/detail/823",
            "https://omegamotor.com.tr/en/product/detail/824",
            "https://omegamotor.com.tr/en/product/detail/810",
            "https://omegamotor.com.tr/en/product/detail/811",
            "https://omegamotor.com.tr/en/product/detail/812",
            "https://omegamotor.com.tr/en/product/detail/809",
            "https://omegamotor.com.tr/en/product/detail/805",
            "https://omegamotor.com.tr/en/product/detail/806",
            "https://omegamotor.com.tr/en/product/detail/807",
            "https://omegamotor.com.tr/en/product/detail/808",
            "https://omegamotor.com.tr/en/product/detail/833",
            "https://omegamotor.com.tr/en/product/detail/831",
            "https://omegamotor.com.tr/en/product/detail/832",
            "https://omegamotor.com.tr/en/product/detail/830",
            "https://omegamotor.com.tr/en/product/detail/828",
            "https://omegamotor.com.tr/en/product/detail/829",
            "https://omegamotor.com.tr/en/product/detail/842",
            "https://omegamotor.com.tr/en/product/detail/130",
            "https://omegamotor.com.tr/en/product/detail/164",
            "https://omegamotor.com.tr/en/product/detail/162",
            "https://omegamotor.com.tr/en/product/detail/163",
            "https://omegamotor.com.tr/en/product/detail/158",
            "https://omegamotor.com.tr/en/product/detail/156",
            "https://omegamotor.com.tr/en/product/detail/157",
            "https://omegamotor.com.tr/en/product/detail/149",
            "https://omegamotor.com.tr/en/product/detail/147",
            "https://omegamotor.com.tr/en/product/detail/148",
            "https://omegamotor.com.tr/en/product/detail/152",
            "https://omegamotor.com.tr/en/product/detail/150",
            "https://omegamotor.com.tr/en/product/detail/151",
            "https://omegamotor.com.tr/en/product/detail/161",
            "https://omegamotor.com.tr/en/product/detail/159",
            "https://omegamotor.com.tr/en/product/detail/160",
            "https://omegamotor.com.tr/en/product/detail/143",
            "https://omegamotor.com.tr/en/product/detail/141",
            "https://omegamotor.com.tr/en/product/detail/142",
            "https://omegamotor.com.tr/en/product/detail/155",
            "https://omegamotor.com.tr/en/product/detail/134",
            "https://omegamotor.com.tr/en/product/detail/132",
            "https://omegamotor.com.tr/en/product/detail/133",
            "https://omegamotor.com.tr/en/product/detail/137",
            "https://omegamotor.com.tr/en/product/detail/135",
            "https://omegamotor.com.tr/en/product/detail/136",
            "https://omegamotor.com.tr/en/product/detail/128",
            "https://omegamotor.com.tr/en/product/detail/126",
            "https://omegamotor.com.tr/en/product/detail/127",
            "https://omegamotor.com.tr/en/product/detail/119",
            "https://omegamotor.com.tr/en/product/detail/117",
            "https://omegamotor.com.tr/en/product/detail/118",
            "https://omegamotor.com.tr/en/product/detail/122",
            "https://omegamotor.com.tr/en/product/detail/120",
            "https://omegamotor.com.tr/en/product/detail/121",
            "https://omegamotor.com.tr/en/product/detail/140",
            "https://omegamotor.com.tr/en/product/detail/138",
            "https://omegamotor.com.tr/en/product/detail/139",
            "https://omegamotor.com.tr/en/product/detail/131",
            "https://omegamotor.com.tr/en/product/detail/129",
            "https://omegamotor.com.tr/en/product/detail/840",
            "https://omegamotor.com.tr/en/product/detail/841",
            "https://omegamotor.com.tr/en/product/detail/834",
            "https://omegamotor.com.tr/en/product/detail/835",
            "https://omegamotor.com.tr/en/product/detail/836",
            "https://omegamotor.com.tr/en/product/detail/846",
            "https://omegamotor.com.tr/en/product/detail/847",
            "https://omegamotor.com.tr/en/product/detail/848",
            "https://omegamotor.com.tr/en/product/detail/843",
            "https://omegamotor.com.tr/en/product/detail/844",
            "https://omegamotor.com.tr/en/product/detail/845",
            "https://omegamotor.com.tr/en/product/detail/837",
            "https://omegamotor.com.tr/en/product/detail/838",
            "https://omegamotor.com.tr/en/product/detail/839",
            "https://omegamotor.com.tr/en/product/detail/849",
            "https://omegamotor.com.tr/en/product/detail/850",
            "https://omegamotor.com.tr/en/product/detail/851",
            "https://omegamotor.com.tr/en/product/detail/125",
            "https://omegamotor.com.tr/en/product/detail/123",
            "https://omegamotor.com.tr/en/product/detail/124",
            "https://omegamotor.com.tr/en/product/detail/989",
            "https://omegamotor.com.tr/en/product/detail/762",
            "https://omegamotor.com.tr/en/product/detail/763",
            "https://omegamotor.com.tr/en/product/detail/764",
            "https://omegamotor.com.tr/en/product/detail/765",
            "https://omegamotor.com.tr/en/product/detail/772",
            "https://omegamotor.com.tr/en/product/detail/773",
            "https://omegamotor.com.tr/en/product/detail/774",
            "https://omegamotor.com.tr/en/product/detail/981",
            "https://omegamotor.com.tr/en/product/detail/753",
            "https://omegamotor.com.tr/en/product/detail/754",
            "https://omegamotor.com.tr/en/product/detail/755",
            "https://omegamotor.com.tr/en/product/detail/983",
            "https://omegamotor.com.tr/en/product/detail/782",
            "https://omegamotor.com.tr/en/product/detail/778",
            "https://omegamotor.com.tr/en/product/detail/779",
            "https://omegamotor.com.tr/en/product/detail/780",
            "https://omegamotor.com.tr/en/product/detail/781",
            "https://omegamotor.com.tr/en/product/detail/788",
            "https://omegamotor.com.tr/en/product/detail/789",
            "https://omegamotor.com.tr/en/product/detail/758",
            "https://omegamotor.com.tr/en/product/detail/759",
            "https://omegamotor.com.tr/en/product/detail/760",
            "https://omegamotor.com.tr/en/product/detail/761",
            "https://omegamotor.com.tr/en/product/detail/775",
            "https://omegamotor.com.tr/en/product/detail/776",
            "https://omegamotor.com.tr/en/product/detail/777",
            "https://omegamotor.com.tr/en/product/detail/60",
            "https://omegamotor.com.tr/en/product/detail/57",
            "https://omegamotor.com.tr/en/product/detail/58",
            "https://omegamotor.com.tr/en/product/detail/61",
            "https://omegamotor.com.tr/en/product/detail/59",
            "https://omegamotor.com.tr/en/product/detail/43",
            "https://omegamotor.com.tr/en/product/detail/41",
            "https://omegamotor.com.tr/en/product/detail/42",
            "https://omegamotor.com.tr/en/product/detail/50",
            "https://omegamotor.com.tr/en/product/detail/47",
            "https://omegamotor.com.tr/en/product/detail/48",
            "https://omegamotor.com.tr/en/product/detail/51",
            "https://omegamotor.com.tr/en/product/detail/49",
            "https://omegamotor.com.tr/en/product/detail/76",
            "https://omegamotor.com.tr/en/product/detail/73",
            "https://omegamotor.com.tr/en/product/detail/74",
            "https://omegamotor.com.tr/en/product/detail/77",
            "https://omegamotor.com.tr/en/product/detail/75",
            "https://omegamotor.com.tr/en/product/detail/783",
            "https://omegamotor.com.tr/en/product/detail/784",
            "https://omegamotor.com.tr/en/product/detail/785",
            "https://omegamotor.com.tr/en/product/detail/786",
            "https://omegamotor.com.tr/en/product/detail/787",
            "https://omegamotor.com.tr/en/product/detail/80",
            "https://omegamotor.com.tr/en/product/detail/78",
            "https://omegamotor.com.tr/en/product/detail/79",
            "https://omegamotor.com.tr/en/product/detail/69",
            "https://omegamotor.com.tr/en/product/detail/67",
            "https://omegamotor.com.tr/en/product/detail/68",
            "https://omegamotor.com.tr/en/product/detail/72",
            "https://omegamotor.com.tr/en/product/detail/70",
            "https://omegamotor.com.tr/en/product/detail/71",
            "https://omegamotor.com.tr/en/product/detail/83",
            "https://omegamotor.com.tr/en/product/detail/153",
            "https://omegamotor.com.tr/en/product/detail/154",
            "https://omegamotor.com.tr/en/product/detail/146",
            "https://omegamotor.com.tr/en/product/detail/144",
            "https://omegamotor.com.tr/en/product/detail/145",
            "https://omegamotor.com.tr/en/product/detail/867",
            "https://omegamotor.com.tr/en/product/detail/868",
            "https://omegamotor.com.tr/en/product/detail/869",
            "https://omegamotor.com.tr/en/product/detail/855",
            "https://omegamotor.com.tr/en/product/detail/856",
            "https://omegamotor.com.tr/en/product/detail/857",
            "https://omegamotor.com.tr/en/product/detail/858",
            "https://omegamotor.com.tr/en/product/detail/859",
            "https://omegamotor.com.tr/en/product/detail/860",
            "https://omegamotor.com.tr/en/product/detail/854",
            "https://omegamotor.com.tr/en/product/detail/852",
            "https://omegamotor.com.tr/en/product/detail/853",
            "https://omegamotor.com.tr/en/product/detail/861",
            "https://omegamotor.com.tr/en/product/detail/862",
            "https://omegamotor.com.tr/en/product/detail/863",
            "https://omegamotor.com.tr/en/product/detail/111",
            "https://omegamotor.com.tr/en/product/detail/112",
            "https://omegamotor.com.tr/en/product/detail/96",
            "https://omegamotor.com.tr/en/product/detail/94",
            "https://omegamotor.com.tr/en/product/detail/95",
            "https://omegamotor.com.tr/en/product/detail/819",
            "https://omegamotor.com.tr/en/product/detail/820",
            "https://omegamotor.com.tr/en/product/detail/821",
            "https://omegamotor.com.tr/en/product/detail/813",
            "https://omegamotor.com.tr/en/product/detail/814",
            "https://omegamotor.com.tr/en/product/detail/815",
            "https://omegamotor.com.tr/en/product/detail/102",
            "https://omegamotor.com.tr/en/product/detail/100",
            "https://omegamotor.com.tr/en/product/detail/101",
            "https://omegamotor.com.tr/en/product/detail/109",
            "https://omegamotor.com.tr/en/product/detail/106",
            "https://omegamotor.com.tr/en/product/detail/107",
            "https://omegamotor.com.tr/en/product/detail/110",
            "https://omegamotor.com.tr/en/product/detail/108",
            "https://omegamotor.com.tr/en/product/detail/825",
            "https://omegamotor.com.tr/en/product/detail/1004",
            "https://omegamotor.com.tr/en/product/detail/791",
            "https://omegamotor.com.tr/en/product/detail/792",
            "https://omegamotor.com.tr/en/product/detail/793",
            "https://omegamotor.com.tr/en/product/detail/794",
            "https://omegamotor.com.tr/en/product/detail/795",
            "https://omegamotor.com.tr/en/product/detail/799",
            "https://omegamotor.com.tr/en/product/detail/800",
            "https://omegamotor.com.tr/en/product/detail/801",
            "https://omegamotor.com.tr/en/product/detail/87",
            "https://omegamotor.com.tr/en/product/detail/84",
            "https://omegamotor.com.tr/en/product/detail/85",
            "https://omegamotor.com.tr/en/product/detail/88",
            "https://omegamotor.com.tr/en/product/detail/86",
            "https://omegamotor.com.tr/en/product/detail/802",
            "https://omegamotor.com.tr/en/product/detail/803",
            "https://omegamotor.com.tr/en/product/detail/804",
            "https://omegamotor.com.tr/en/product/detail/796",
            "https://omegamotor.com.tr/en/product/detail/797",
            "https://omegamotor.com.tr/en/product/detail/798",
            "https://omegamotor.com.tr/en/product/detail/81",
            "https://omegamotor.com.tr/en/product/detail/82",
            "https://omegamotor.com.tr/en/product/detail/91",
            "https://omegamotor.com.tr/en/product/detail/89",
            "https://omegamotor.com.tr/en/product/detail/90",
            "https://omegamotor.com.tr/en/product/detail/93",
            "https://omegamotor.com.tr/en/product/detail/92",
            "https://omegamotor.com.tr/en/product/detail/105",
            "https://omegamotor.com.tr/en/product/detail/103",
            "https://omegamotor.com.tr/en/product/detail/104",
            "https://omegamotor.com.tr/en/product/detail/116",
            "https://omegamotor.com.tr/en/product/detail/114",
            "https://omegamotor.com.tr/en/product/detail/115",
            "https://omegamotor.com.tr/en/product/detail/99",
            "https://omegamotor.com.tr/en/product/detail/97",
            "https://omegamotor.com.tr/en/product/detail/98",
            "https://omegamotor.com.tr/en/product/detail/818",
            "https://omegamotor.com.tr/en/product/detail/816",
            "https://omegamotor.com.tr/en/product/detail/817",
            "https://omegamotor.com.tr/en/product/detail/113",
            "https://omegamotor.com.tr/en/product/detail/864",
            "https://omegamotor.com.tr/en/product/detail/865",
            "https://omegamotor.com.tr/en/product/detail/866",
            "https://omegamotor.com.tr/en/product/detail/872",
            "https://omegamotor.com.tr/en/product/detail/870",
            "https://omegamotor.com.tr/en/product/detail/871",
            "https://omegamotor.com.tr/en/product/detail/875",
            "https://omegamotor.com.tr/en/product/detail/873",
            "https://omegamotor.com.tr/en/product/detail/874",
            "https://omegamotor.com.tr/en/product/detail/881",
            "https://omegamotor.com.tr/en/product/detail/879",
            "https://omegamotor.com.tr/en/product/detail/880",
            "https://omegamotor.com.tr/en/product/detail/876",
            "https://omegamotor.com.tr/en/product/detail/877",
            "https://omegamotor.com.tr/en/product/detail/878",
            "https://omegamotor.com.tr/en/product/detail/882",
            "https://omegamotor.com.tr/en/product/detail/883",
            "https://omegamotor.com.tr/en/product/detail/884",
            "https://omegamotor.com.tr/en/product/detail/167",
            "https://omegamotor.com.tr/en/product/detail/165",
            "https://omegamotor.com.tr/en/product/detail/255",
            "https://omegamotor.com.tr/en/product/detail/256",
            "https://omegamotor.com.tr/en/product/detail/251",
            "https://omegamotor.com.tr/en/product/detail/249",
            "https://omegamotor.com.tr/en/product/detail/250",
            "https://omegamotor.com.tr/en/product/detail/245",
            "https://omegamotor.com.tr/en/product/detail/243",
            "https://omegamotor.com.tr/en/product/detail/244",
            "https://omegamotor.com.tr/en/product/detail/242",
            "https://omegamotor.com.tr/en/product/detail/240",
            "https://omegamotor.com.tr/en/product/detail/241",
            "https://omegamotor.com.tr/en/product/detail/254",
            "https://omegamotor.com.tr/en/product/detail/252",
            "https://omegamotor.com.tr/en/product/detail/253",
            "https://omegamotor.com.tr/en/product/detail/248",
            "https://omegamotor.com.tr/en/product/detail/246",
            "https://omegamotor.com.tr/en/product/detail/247",
            "https://omegamotor.com.tr/en/product/detail/275",
            "https://omegamotor.com.tr/en/product/detail/273",
            "https://omegamotor.com.tr/en/product/detail/274",
            "https://omegamotor.com.tr/en/product/detail/177",
            "https://omegamotor.com.tr/en/product/detail/178",
            "https://omegamotor.com.tr/en/product/detail/212",
            "https://omegamotor.com.tr/en/product/detail/210",
            "https://omegamotor.com.tr/en/product/detail/211",
            "https://omegamotor.com.tr/en/product/detail/203",
            "https://omegamotor.com.tr/en/product/detail/201",
            "https://omegamotor.com.tr/en/product/detail/202",
            "https://omegamotor.com.tr/en/product/detail/194",
            "https://omegamotor.com.tr/en/product/detail/192",
            "https://omegamotor.com.tr/en/product/detail/193",
            "https://omegamotor.com.tr/en/product/detail/206",
            "https://omegamotor.com.tr/en/product/detail/204",
            "https://omegamotor.com.tr/en/product/detail/205",
            "https://omegamotor.com.tr/en/product/detail/197",
            "https://omegamotor.com.tr/en/product/detail/195",
            "https://omegamotor.com.tr/en/product/detail/196",
            "https://omegamotor.com.tr/en/product/detail/191",
            "https://omegamotor.com.tr/en/product/detail/189",
            "https://omegamotor.com.tr/en/product/detail/190",
            "https://omegamotor.com.tr/en/product/detail/214",
            "https://omegamotor.com.tr/en/product/detail/236",
            "https://omegamotor.com.tr/en/product/detail/234",
            "https://omegamotor.com.tr/en/product/detail/235",
            "https://omegamotor.com.tr/en/product/detail/227",
            "https://omegamotor.com.tr/en/product/detail/225",
            "https://omegamotor.com.tr/en/product/detail/226",
            "https://omegamotor.com.tr/en/product/detail/218",
            "https://omegamotor.com.tr/en/product/detail/216",
            "https://omegamotor.com.tr/en/product/detail/217",
            "https://omegamotor.com.tr/en/product/detail/239",
            "https://omegamotor.com.tr/en/product/detail/237",
            "https://omegamotor.com.tr/en/product/detail/238",
            "https://omegamotor.com.tr/en/product/detail/230",
            "https://omegamotor.com.tr/en/product/detail/228",
            "https://omegamotor.com.tr/en/product/detail/229",
            "https://omegamotor.com.tr/en/product/detail/221",
            "https://omegamotor.com.tr/en/product/detail/219",
            "https://omegamotor.com.tr/en/product/detail/220",
            "https://omegamotor.com.tr/en/product/detail/257",
            "https://omegamotor.com.tr/en/product/detail/166",
            "https://omegamotor.com.tr/en/product/detail/185",
            "https://omegamotor.com.tr/en/product/detail/183",
            "https://omegamotor.com.tr/en/product/detail/184",
            "https://omegamotor.com.tr/en/product/detail/176",
            "https://omegamotor.com.tr/en/product/detail/174",
            "https://omegamotor.com.tr/en/product/detail/175",
            "https://omegamotor.com.tr/en/product/detail/182",
            "https://omegamotor.com.tr/en/product/detail/180",
            "https://omegamotor.com.tr/en/product/detail/181",
            "https://omegamotor.com.tr/en/product/detail/170",
            "https://omegamotor.com.tr/en/product/detail/168",
            "https://omegamotor.com.tr/en/product/detail/169",
            "https://omegamotor.com.tr/en/product/detail/173",
            "https://omegamotor.com.tr/en/product/detail/171",
            "https://omegamotor.com.tr/en/product/detail/172",
            "https://omegamotor.com.tr/en/product/detail/188",
            "https://omegamotor.com.tr/en/product/detail/186",
            "https://omegamotor.com.tr/en/product/detail/187",
            "https://omegamotor.com.tr/en/product/detail/179",
            "https://omegamotor.com.tr/en/product/detail/266",
            "https://omegamotor.com.tr/en/product/detail/264",
            "https://omegamotor.com.tr/en/product/detail/265",
            "https://omegamotor.com.tr/en/product/detail/260",
            "https://omegamotor.com.tr/en/product/detail/258",
            "https://omegamotor.com.tr/en/product/detail/259",
            "https://omegamotor.com.tr/en/product/detail/263",
            "https://omegamotor.com.tr/en/product/detail/261",
            "https://omegamotor.com.tr/en/product/detail/262",
            "https://omegamotor.com.tr/en/product/detail/281",
            "https://omegamotor.com.tr/en/product/detail/279",
            "https://omegamotor.com.tr/en/product/detail/280",
            "https://omegamotor.com.tr/en/product/detail/272",
            "https://omegamotor.com.tr/en/product/detail/270",
            "https://omegamotor.com.tr/en/product/detail/271",
            "https://omegamotor.com.tr/en/product/detail/278",
            "https://omegamotor.com.tr/en/product/detail/276",
            "https://omegamotor.com.tr/en/product/detail/277",
            "https://omegamotor.com.tr/en/product/detail/269",
            "https://omegamotor.com.tr/en/product/detail/267",
            "https://omegamotor.com.tr/en/product/detail/268",
            "https://omegamotor.com.tr/en/product/detail/287",
            "https://omegamotor.com.tr/en/product/detail/285",
            "https://omegamotor.com.tr/en/product/detail/286",
            "https://omegamotor.com.tr/en/product/detail/299",
            "https://omegamotor.com.tr/en/product/detail/297",
            "https://omegamotor.com.tr/en/product/detail/298",
            "https://omegamotor.com.tr/en/product/detail/293",
            "https://omegamotor.com.tr/en/product/detail/291",
            "https://omegamotor.com.tr/en/product/detail/292",
            "https://omegamotor.com.tr/en/product/detail/296",
            "https://omegamotor.com.tr/en/product/detail/294",
            "https://omegamotor.com.tr/en/product/detail/295",
            "https://omegamotor.com.tr/en/product/detail/290",
            "https://omegamotor.com.tr/en/product/detail/288",
            "https://omegamotor.com.tr/en/product/detail/289",
            "https://omegamotor.com.tr/en/product/detail/284",
            "https://omegamotor.com.tr/en/product/detail/282",
            "https://omegamotor.com.tr/en/product/detail/283",
            "https://omegamotor.com.tr/en/product/detail/301",
            "https://omegamotor.com.tr/en/product/detail/302",
            "https://omegamotor.com.tr/en/product/detail/300",
            "https://omegamotor.com.tr/en/product/detail/317",
            "https://omegamotor.com.tr/en/product/detail/315",
            "https://omegamotor.com.tr/en/product/detail/316",
            "https://omegamotor.com.tr/en/product/detail/311",
            "https://omegamotor.com.tr/en/product/detail/309",
            "https://omegamotor.com.tr/en/product/detail/310",
            "https://omegamotor.com.tr/en/product/detail/320",
            "https://omegamotor.com.tr/en/product/detail/318",
            "https://omegamotor.com.tr/en/product/detail/319",
            "https://omegamotor.com.tr/en/product/detail/314",
            "https://omegamotor.com.tr/en/product/detail/312",
            "https://omegamotor.com.tr/en/product/detail/313",
            "https://omegamotor.com.tr/en/product/detail/304",
            "https://omegamotor.com.tr/en/product/detail/305",
            "https://omegamotor.com.tr/en/product/detail/303",
            "https://omegamotor.com.tr/en/product/detail/308",
            "https://omegamotor.com.tr/en/product/detail/306",
            "https://omegamotor.com.tr/en/product/detail/307",
            "https://omegamotor.com.tr/en/product/detail/388",
            "https://omegamotor.com.tr/en/product/detail/389",
            "https://omegamotor.com.tr/en/product/detail/387",
            "https://omegamotor.com.tr/en/product/detail/385",
            "https://omegamotor.com.tr/en/product/detail/386",
            "https://omegamotor.com.tr/en/product/detail/384",
            "https://omegamotor.com.tr/en/product/detail/382",
            "https://omegamotor.com.tr/en/product/detail/383",
            "https://omegamotor.com.tr/en/product/detail/381",
            "https://omegamotor.com.tr/en/product/detail/326",
            "https://omegamotor.com.tr/en/product/detail/324",
            "https://omegamotor.com.tr/en/product/detail/325",
            "https://omegamotor.com.tr/en/product/detail/323",
            "https://omegamotor.com.tr/en/product/detail/321",
            "https://omegamotor.com.tr/en/product/detail/322",
            "https://omegamotor.com.tr/en/product/detail/331",
            "https://omegamotor.com.tr/en/product/detail/332",
            "https://omegamotor.com.tr/en/product/detail/330",
            "https://omegamotor.com.tr/en/product/detail/341",
            "https://omegamotor.com.tr/en/product/detail/339",
            "https://omegamotor.com.tr/en/product/detail/340",
            "https://omegamotor.com.tr/en/product/detail/335",
            "https://omegamotor.com.tr/en/product/detail/333",
            "https://omegamotor.com.tr/en/product/detail/334",
            "https://omegamotor.com.tr/en/product/detail/344",
            "https://omegamotor.com.tr/en/product/detail/342",
            "https://omegamotor.com.tr/en/product/detail/343",
            "https://omegamotor.com.tr/en/product/detail/338",
            "https://omegamotor.com.tr/en/product/detail/336",
            "https://omegamotor.com.tr/en/product/detail/337",
            "https://omegamotor.com.tr/en/product/detail/328",
            "https://omegamotor.com.tr/en/product/detail/329",
            "https://omegamotor.com.tr/en/product/detail/327",
            "https://omegamotor.com.tr/en/product/detail/345",
            "https://omegamotor.com.tr/en/product/detail/358",
            "https://omegamotor.com.tr/en/product/detail/359",
            "https://omegamotor.com.tr/en/product/detail/357",
            "https://omegamotor.com.tr/en/product/detail/355",
            "https://omegamotor.com.tr/en/product/detail/356",
            "https://omegamotor.com.tr/en/product/detail/354",
            "https://omegamotor.com.tr/en/product/detail/349",
            "https://omegamotor.com.tr/en/product/detail/350",
            "https://omegamotor.com.tr/en/product/detail/361",
            "https://omegamotor.com.tr/en/product/detail/362",
            "https://omegamotor.com.tr/en/product/detail/360",
            "https://omegamotor.com.tr/en/product/detail/368",
            "https://omegamotor.com.tr/en/product/detail/366",
            "https://omegamotor.com.tr/en/product/detail/367",
            "https://omegamotor.com.tr/en/product/detail/365",
            "https://omegamotor.com.tr/en/product/detail/363",
            "https://omegamotor.com.tr/en/product/detail/364",
            "https://omegamotor.com.tr/en/product/detail/352",
            "https://omegamotor.com.tr/en/product/detail/353",
            "https://omegamotor.com.tr/en/product/detail/351",
            "https://omegamotor.com.tr/en/product/detail/347",
            "https://omegamotor.com.tr/en/product/detail/348",
            "https://omegamotor.com.tr/en/product/detail/346",
            "https://omegamotor.com.tr/en/product/detail/376",
            "https://omegamotor.com.tr/en/product/detail/377",
            "https://omegamotor.com.tr/en/product/detail/375",
            "https://omegamotor.com.tr/en/product/detail/370",
            "https://omegamotor.com.tr/en/product/detail/371",
            "https://omegamotor.com.tr/en/product/detail/369",
            "https://omegamotor.com.tr/en/product/detail/379",
            "https://omegamotor.com.tr/en/product/detail/380",
            "https://omegamotor.com.tr/en/product/detail/378",
            "https://omegamotor.com.tr/en/product/detail/373",
            "https://omegamotor.com.tr/en/product/detail/374",
            "https://omegamotor.com.tr/en/product/detail/372"
        ]
    },
};

// Function to fetch PDF links from a product page using Puppeteer Core
async function fetchPdfLinks(page, selector) {
    // No need to launch a new browser instance; we use the existing page
    await page.goto(page.url(), { waitUntil: 'networkidle2', timeout: 30000000 });
    console.log(`Navigated to ${page.url()}`);

    const pdfLinks = await page.evaluate((selector) => {
        // Find the specified selector
        const container = document.querySelector(selector);
        if (!container) return []; // Return an empty array if the selector is not found

        // Collect all PDF links within the specified container, case insensitive
        const links = Array.from(container.querySelectorAll('a[href$=".pdf"], a[href$=".PDF"]'));
        return links.map(link => link.href);
    }, selector); // Pass the selector to the page context

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

// Function to send notification email
async function sendNotification(productName, duration) {
    // Create a transporter object using your email service
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Use your email service (e.g., Gmail)
        auth: {
            user: 'akinluaolorunfunminiyi', // Your email address
            pass: 'qnswilhynzsybrrp' // Your email password or app password
        }
    });

    // Email options
    const mailOptions = {
        from: 'akinluaolorunfunminiyi@gmail.com', // Sender address
        to: 'olorunfunminiyiakinlua@student.oauife.edu.ng', // List of recipients
        subject: `PDF Processing Complete for ${productName}`, // Subject line
        text: `All PDFs for the product "${productName}" have been processed successfully in ${duration} seconds!`, // Plain text body
    };

    // Send the email
    await transporter.sendMail(mailOptions);
    console.log(`Notification sent for product: ${productName}`);
}

// Helper function to limit concurrency of promises
async function throttledPromiseAll(tasks, concurrency = 3) {
  const results = [];
  const running = new Set();
  
  for (const task of tasks) {
    const promise = Promise.resolve().then(() => task());
    results.push(promise);
    
    running.add(promise);
    const cleanup = () => running.delete(promise);
    promise.then(cleanup, cleanup);
    
    if (running.size >= concurrency) {
      // Wait for one task to complete before starting another
      await Promise.race(running);
    }
  }
  
  return Promise.all(results);
}

// Process a single PDF with retry logic
async function processSinglePdf(pdfLink, pdfFilePath, outputPdfPath, coverPagePath, sensitiveText, productName, index, total) {
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[${productName}] Retry ${attempt-1}/${maxRetries-1} for PDF ${index + 1}/${total}`);
      }
      
      console.log(`[${productName}] Downloading PDF ${index + 1}/${total}: ${pdfLink}`);
      await downloadPdf(pdfLink, pdfFilePath);
      
      console.log(`[${productName}] Modifying PDF ${index + 1}/${total}`);
      await modifyPdf(pdfFilePath, outputPdfPath, coverPagePath, sensitiveText);
      
      console.log(`[${productName}] ✅ Successfully processed PDF ${index + 1}/${total}`);
      return true; // Success
    } catch (error) {
      lastError = error;
      console.error(`[${productName}] Attempt ${attempt}/${maxRetries} failed for PDF ${index + 1}/${total}: ${error.message}`);
      
      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff)
        const delay = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s
        console.log(`[${productName}] Waiting ${delay/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we get here, all retries failed
  console.error(`[${productName}] ❌ Failed to process PDF ${index + 1}/${total} after ${maxRetries} attempts: ${lastError.message}`);
  await logFailedPdf(productName, pdfLink); // Log the failed PDF
  return false;
}

// Main function to process each product
async function processProducts() {
  // Record overall start time
  const overallStartTime = Date.now();
  console.log(`Starting overall process at ${new Date(overallStartTime).toLocaleString()}`);
  
  const downloadDir = 'downloaded_pdfs';
  const outputDir = 'output_pdfs';
  fs.mkdirSync(downloadDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  // Create a progress tracker file
  const progressFile = 'progress.json';
  let progress = {};
  if (fs.existsSync(progressFile)) {
    try {
      progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    } catch (err) {
      console.error(`Error reading progress file: ${err.message}`);
    }
  }

  // Create a cluster with concurrency options
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE, // Change to PAGE mode instead of CONTEXT
    maxConcurrency: 1, // Reduced from 20 to 5 for stability
    puppeteerOptions: {
      // Use default Chromium from puppeteer instead of system Chrome
      // Remove the executablePath option
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Add this to prevent crashes in Docker/Linux
        '--disable-gpu',           // Disable GPU hardware acceleration
        '--disable-features=IsolateOrigins,site-per-process' // Disable site isolation
      ],
      timeout: 60000 // Set timeout to 60 seconds (default is 30)
    },
    // Add these options for better error handling and recovery
    retryLimit: 3,
    retryDelay: 5000,
    // Add monitor to track cluster status and errors
    monitor: true
  });

  // Task to process a product - improved error handling
  await cluster.task(async ({ page, data: { productUrl, domain, domainData } }) => {
    const startTime = Date.now();
    console.log(`Starting processing: ${productUrl}`);

    try {
      // Set longer timeouts for navigation
      page.setDefaultNavigationTimeout(120000); // 2 minutes
      page.setDefaultTimeout(120000);

      // Retry logic for navigation
      const maxRetries = 3;
      let navigationSuccess = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await page.goto(productUrl, { 
            waitUntil: 'networkidle2', 
            timeout: 120000 // 2 minutes timeout for navigation
          });
          console.log(`Navigated to ${productUrl}`);
          navigationSuccess = true;
          break; // Exit the loop if navigation is successful
        } catch (error) {
          console.error(`Attempt ${attempt} to navigate to ${productUrl} failed: ${error.message}`);
          if (attempt < maxRetries) {
            console.log(`Retrying navigation to ${productUrl}...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retrying
          }
        }
      }

      if (!navigationSuccess) {
        console.warn(`Failed to navigate to ${productUrl} after ${maxRetries} attempts. Skipping this product.`);
        return; // Skip processing this product
      }

      // Try to get product name with better error handling
      let productName;
      try {
        productName = await page.$eval(domainData.selector, el => el.innerText.trim());
        // Sanitize product name for filesystem
        productName = productName.replace(/[\/\\:*?"<>|]/g, '_');
      } catch (err) {
        console.error(`Failed to get product name for ${productUrl}: ${err.message}`);
        productName = `product_${Date.now()}`; // Fallback name
      }
      console.log(`Product name: ${productName}`);

      // Get PDF links with better error handling
      let pdfLinks = [];
      try {
        pdfLinks = await page.evaluate((pdflink_selector) => {
          const container = document.querySelector(pdflink_selector);
          if (!container) {
            console.error('PDF selector container not found');
            return [];
          }
          const links = Array.from(container.querySelectorAll('a[href$=".pdf"], a[href$=".PDF"]'));
          return [...new Set(links.map(link => link.href))];
        }, domainData.fileselector);
      } catch (err) {
        console.error(`Failed to get PDF links for ${productUrl}: ${err.message}`);
      }

      console.log(`Found ${pdfLinks.length} PDF links for ${productName}`);
      
      if (pdfLinks.length === 0) {
        console.warn(`No PDF links found for ${productUrl}`);
        return; // Skip processing if no PDFs
      }

      // Create directories
      const productDir = path.join(downloadDir, domain, productName);
      const outputProductDir = path.join(outputDir, domain, productName);
      fs.mkdirSync(productDir, { recursive: true });
      fs.mkdirSync(outputProductDir, { recursive: true });

      // UPDATED: Process PDFs in parallel with retry logic and controlled concurrency
      try {
        console.log(`[${productName}] Processing ${pdfLinks.length} PDFs in parallel (max 3 at a time)`);
        
        // Create task functions for each PDF
        const tasks = pdfLinks.map((pdfLink, i) => {
          return async () => {
            const pdfFileName = `${productName}_${i + 1}.pdf`;
            const pdfFilePath = path.join(productDir, pdfFileName);
            const outputPdfPath = path.join(outputProductDir, pdfFileName);
            
            return processSinglePdf(
              pdfLink, 
              pdfFilePath, 
              outputPdfPath, 
              'cover_page.png', 
              domainData.sensitiveText, 
              productName, 
              i, 
              pdfLinks.length
            );
          };
        });
        
        // Run tasks with limited concurrency
        const results = await throttledPromiseAll(tasks, 1); // Process 3 PDFs at a time
        
        // Count successes and failures
        const successCount = results.filter(result => result === true).length;
        const failureCount = results.filter(result => result === false).length;
        
        console.log(`[${productName}] Completed processing all PDFs: ${successCount} successful, ${failureCount} failed`);
        
        if (failureCount > 0) {
          console.warn(`[${productName}] Warning: ${failureCount} PDFs failed to process even after retries`);
          await sendNotification(`Error: ${productName} || ${productUrl}`, `[${productName} || ${productUrl}] Warning: ${failureCount} PDFs failed to process even after retries`);
        }
      } catch (parallelError) {
        console.error(`[${productName}] Error in parallel PDF processing: ${parallelError.message}`);
      }

      // Mark this product as processed in our progress tracker
      if (!progress[domain].processed.includes(productUrl)) {
        progress[domain].processed.push(productUrl);
        // Save progress after each product completes
        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
      }

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      console.log(`✅ Completed all PDFs for ${productName} in ${duration} seconds`);
      
      try {
        await sendNotification(productName, duration);
      } catch (notifyErr) {
        console.error(`Failed to send notification: ${notifyErr.message}`);
      }
      
    } catch (error) {
      console.error(`❌ Error processing product ${productUrl}: ${error.message}`);
      try {
        await sendNotification(`Error: ${productUrl}`, error.message);
      } catch (notifyErr) {
        console.error(`Failed to send error notification: ${notifyErr.message}`);
      }
    }
  });

  try {
    // Queue all products with better tracking
    let queuedCount = 0;
    for (const [domain, domainData] of Object.entries(productsByDomain)) {
      // Check if domain already processed
      if (progress[domain] && progress[domain].completed) {
        console.log(`Skipping completed domain: ${domain}`);
        continue;
      }

      console.log(`Processing domain: ${domain} with ${domainData.products.length} products`);
      progress[domain] = progress[domain] || { 
        processed: [], 
        total: domainData.products.length 
      };

      // Queue each product that hasn't been processed yet
      for (const productUrl of domainData.products) {
        if (!progress[domain].processed.includes(productUrl)) {
          cluster.queue({ productUrl, domain, domainData });
          queuedCount++;
        }
      }

      // Update progress after each domain is queued
      fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
    }

    console.log(`Queued ${queuedCount} products for processing`);

    // Wait for all tasks to complete
    await cluster.idle();
    
    // Calculate total time after processing is complete
    const overallEndTime = Date.now();
    const totalDurationSeconds = (overallEndTime - overallStartTime) / 1000;
    const hours = Math.floor(totalDurationSeconds / 3600);
    const minutes = Math.floor((totalDurationSeconds % 3600) / 60);
    const seconds = Math.floor(totalDurationSeconds % 60);
    
    const formattedDuration = `${hours}h ${minutes}m ${seconds}s`;
    
    console.log(`✅ ALL PROCESSING COMPLETE! Total time: ${formattedDuration}`);
    console.log(`Started: ${new Date(overallStartTime).toLocaleString()}`);
    console.log(`Finished: ${new Date(overallEndTime).toLocaleString()}`);

    // Send final notification email about completion
    await sendFinalNotification(queuedCount, formattedDuration);

    // Mark all domains as completed
    for (const domain in progress) {
      progress[domain].completed = true;
    }
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));

  } catch (error) {
    console.error('Error in main process:', error);
    
    // Calculate partial duration even if error occurs
    const partialDuration = ((Date.now() - overallStartTime) / 1000).toFixed(2);
    await sendNotification('Process Error', `Process failed after ${partialDuration} seconds: ${error.message}`);
  } finally {
    await cluster.close();
  }
}

// New function to send final notification email
async function sendFinalNotification(totalProducts, duration) {
  // Create a transporter object using your email service
  const transporter = nodemailer.createTransport({
    service: 'gmail', // Use your email service
    auth: {
      user: 'akinluaolorunfunminiyi', 
      pass: 'qnswilhynzsybrrp'
    }
  });

  // Email options
  const mailOptions = {
    from: 'akinluaolorunfunminiyi@gmail.com',
    to: 'olorunfunminiyiakinlua@student.oauife.edu.ng',
    subject: '🎉 COMPLETE: PDF Processing Job Finished',
    html: `
      <h2>PDF Processing Complete!</h2>
      <p>The entire PDF processing job has been completed:</p>
      <ul>
        <li><strong>Total Products Processed:</strong> ${totalProducts}</li>
        <li><strong>Total Duration:</strong> ${duration}</li>
        <li><strong>Completion Time:</strong> ${new Date().toLocaleString()}</li>
      </ul>
      <p>All modified PDFs have been saved to the output directory.</p>
    `,
  };

  // Send the email
  await transporter.sendMail(mailOptions);
  console.log(`Final completion notification sent!`);
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

    console.log("collected");
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



  
function drawRedaction(page, pdfWidth, pdfHeight, box, divide=2) {
    // If your OCR was done on a certain dimension, adjust if needed
    // But let's assume 1:1 for simplicity:
  
    const padding = 2;
    const x = (box.x0)/divide - padding;
    const width = (box.x1 - box.x0)/divide + padding * 2;
  
    // PDF coordinate system has origin at bottom-left
    // If the OCR origin is top-left, you invert Y
    const y = pdfHeight - (box.y1)/divide - padding;
    const height = (box.y1 - box.y0)/divide + padding * 2;
  
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: rgb(1, 1, 1) // White fill
    });
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
    try{
      const existingPdfBytes = fs.readFileSync(inputPdfPath);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
  
      // OCR the entire PDF and fetch QR code results in parallel
      const { ocrResults, qrResults } = await ocrExtractText(existingPdfBytes); // Updated to destructure results
  
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
          for (const phrase of phrases) {
              const matches = findPhraseMatches2(ocrPageData.words, phrase);
              if (matches.length > 0) {
                  console.log(`Page ${i + 1}: Found phrase "${phrase}" ${matches.length} time(s).`);
                  for (const matchWords of matches) {
                      // const box = combineBoundingBoxes(matchWords);
                      const box = combineBoundingBoxes(matchWords);
                      drawRedaction(page, width, height, box);
                  }
              }
          }
  
          // Draw rectangles for QR results
          const qrPageData = qrResults.filter(qr => qr.page === (i + 1)); // Filter QR results for the current page
          qrPageData.forEach(qr => {
              const box = {
                  x0: qr.bbox.x1,
                  y0: qr.bbox.y1,
                  x1: qr.bbox.x2,
                  y1: qr.bbox.y2
              };
              drawRedaction(page, width, height, box, 2);
  
          });
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
    } catch (error) {
        console.log("ERROR MODIFYING PDF ", inputPdfPath)
        console.log(error)
        throw error;
    }
    
}

// New function to fetch QR results
async function fetchQrResults(pdfBuffer) {
    const formData = new FormData();
    // formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }));
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

//   const SENSITIVE_PHRASES = [
//     "Adress : Dudullu Organize Sanayi Bölgesi 2. Cadde No : 10 Ümraniye - İstanbul",
//     "Telephone : +90 216 266 32 80",
//     "Fax : +90 216 266 32 99",
//     "E - mail : info@omegamotor.com.tr",
//     "www.omegamotor.com.tr"
//   ];

// const SENSITIVE_PHRASES = [
//   "Adress : Dudullu Organize Sanayi Bölgesi 2. Cadde No : 10 Ümraniye - İstanbul",
//   "Telephone : +90 216 266 32 80",
//   "Fax : +90 216 266 32 99",
//   "E - mail : info@omegamotor.com.tr",
//   "www.omegamotor.com.tr"
// ];

// modifyPdf("3M0SA3E-09LK21CT0 3.pdf", "output.pdf", "cover_page.png", SENSITIVE_PHRASES);

// Function to log failed PDF processing attempts
async function logFailedPdf(productName, productUrl) {
    const logFilePath = 'failed_pdfs.json'; // File to store failed PDFs
    let failedPdfs = [];

    // Check if the log file already exists
    if (fs.existsSync(logFilePath)) {
        try {
            const data = fs.readFileSync(logFilePath, 'utf8');
            failedPdfs = JSON.parse(data); // Load existing failed PDFs
        } catch (err) {
            console.error(`Error reading failed PDFs log: ${err.message}`);
        }
    }

    // Add the new failed PDF to the list
    failedPdfs.push({ productName, productUrl });

    // Write the updated list back to the file
    try {
        fs.writeFileSync(logFilePath, JSON.stringify(failedPdfs, null, 2));
        console.log(`Logged failed PDF: ${productName} - ${productUrl}`);
    } catch (err) {
        console.error(`Error writing to failed PDFs log: ${err.message}`);
    }
}