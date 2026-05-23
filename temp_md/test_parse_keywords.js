const fs = require("fs");
const path = require("path");

const extractorPath = path.join(
  __dirname,
  "..",
  "renderer",
  "modules",
  "m1_archive",
  "adminpage",
  "api",
  "extract_archive.js",
);
const code = fs.readFileSync(extractorPath, "utf8");
// Evaluate the extractor file in this context
eval(code);

const sample = `OPERATIONAL DEFINITION OF TERMS

Machine Learning. A branch of artificial intelligence that enables computer systems to learn patterns from data.
Gaming Performance. The measurable quality of a user's gaming experience based on factors.
Hardware Analyzer. A software-based tool or system designed to detect, evaluate.
CHAPTER 2`;

console.log("Sample text:\n", sample);
console.log("Extracted keywords:", parsePdfKeywords(sample));
