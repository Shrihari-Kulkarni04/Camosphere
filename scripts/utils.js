const fs = require("fs");
const path = require("path");

function loadEnv() {
  if (process.env.VERCEL) return;

  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    require("dotenv").config({ path: envPath, quiet: true });
    return;
  }

  require("dotenv").config({ quiet: true });
}

function assertRequiredEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
}

function getEnvNumber(name, fallback, options = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  if (options.min !== undefined && value < options.min) return fallback;
  if (options.max !== undefined && value > options.max) return fallback;

  return value;
}

function cleanText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(text) {
  const matches = cleanText(text).match(/\S+/g);
  return matches ? matches.length : 0;
}

function batchArray(items, batchSize) {
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(operation, options = {}) {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const label = options.label || "operation";

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;

      const delay = baseDelayMs * 2 ** attempt;
      if (typeof options.onRetry === "function") {
        options.onRetry(error, attempt + 1, delay);
      }
      await sleep(delay);
    }
  }

  throw new Error(`${label} failed after ${retries + 1} attempt(s): ${toErrorMessage(lastError)}`);
}

function toErrorMessage(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  return JSON.stringify(error);
}

function normalizeEmbeddingVector(values, expectedDimensions) {
  if (!Array.isArray(values)) {
    throw new Error("Embedding response did not contain a numeric vector.");
  }

  const vector = values.map((value) => Number(value));
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding vector contains non-numeric values.");
  }

  if (expectedDimensions && vector.length !== expectedDimensions) {
    throw new Error(
      `Embedding vector dimension mismatch. Expected ${expectedDimensions}, received ${vector.length}.`
    );
  }

  return vector;
}

async function renderPdfPage(pageData) {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: true,
    disableCombineTextItems: false,
  });

  let lastY = null;
  const lines = [];

  for (const item of textContent.items) {
    const value = cleanText(item.str);
    if (!value) continue;

    const y = Math.round(item.transform[5]);
    const sameLine = lastY === null || Math.abs(y - lastY) <= 2;

    if (sameLine && lines.length) {
      lines[lines.length - 1] = `${lines[lines.length - 1]} ${value}`.trim();
    } else {
      lines.push(value);
    }

    lastY = y;
  }

  return cleanText(lines.join("\n"));
}

async function extractPdfPages(pdfPath) {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Knowledge base PDF not found at ${pdfPath}`);
  }

  const pages = [];
  const dataBuffer = fs.readFileSync(pdfPath);

  const data = await pdf(dataBuffer, {
    pagerender: async (pageData) => {
      const text = await renderPdfPage(pageData);
      const pageNumber =
        typeof pageData.pageNumber === "number"
          ? pageData.pageNumber
          : typeof pageData.pageIndex === "number"
            ? pageData.pageIndex + 1
            : pages.length + 1;

      pages[pageNumber - 1] = {
        page: pageNumber,
        text,
      };

      return text;
    },
  });

  const normalizedPages = Array.from({ length: data.numpages }, (_, index) => {
    return pages[index] || { page: index + 1, text: "" };
  });

  return {
    pages: normalizedPages,
    totalPages: data.numpages,
    text: normalizedPages
      .map((page) => `--- Page ${page.page} ---\n${page.text}`)
      .join("\n\n"),
    info: data.info || null,
    metadata: data.metadata || null,
  };
}

function formatPageRange(pages) {
  const uniquePages = [...new Set((pages || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!uniquePages.length) return "";

  const ranges = [];
  let start = uniquePages[0];
  let previous = uniquePages[0];

  for (let i = 1; i <= uniquePages.length; i += 1) {
    const current = uniquePages[i];
    if (current === previous + 1) {
      previous = current;
      continue;
    }

    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = current;
    previous = current;
  }

  return ranges.join(", ");
}

function truncateForPrompt(text, maxChars) {
  const cleaned = cleanText(text);
  if (!maxChars || cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars).trim()}...`;
}

module.exports = {
  assertRequiredEnv,
  batchArray,
  cleanText,
  countWords,
  extractPdfPages,
  formatPageRange,
  getEnvNumber,
  loadEnv,
  normalizeEmbeddingVector,
  retry,
  sleep,
  toErrorMessage,
  truncateForPrompt,
};
