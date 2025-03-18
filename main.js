const express = require("express");
const path = require("path");
const serveIndex = require("serve-index");

const app = express();
const PORT = 3002;
const FILES_DIR = path.join(__dirname, "output_pdfs");

// Serve static files
app.get("/", (req, res) => {
  res.send("Hello World");
});
app.use("/files", express.static(FILES_DIR));

// Serve directory listing
app.use("/files", serveIndex(FILES_DIR, { icons: true }));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/files/`);
});
