const { cleanText, countWords, formatPageRange } = require("./utils");

const DEFAULT_CHUNK_SIZE_WORDS = 600;
const DEFAULT_OVERLAP_WORDS = 100;

const ABBREVIATIONS = new Set([
  "dr",
  "mr",
  "mrs",
  "ms",
  "prof",
  "sr",
  "jr",
  "hod",
  "dept",
  "no",
  "nos",
  "etc",
  "e.g",
  "i.e",
  "ph",
  "ph.d",
  "b.e",
  "d.e",
  "b.voc",
  "d.voc",
]);

function getPreviousToken(text, index) {
  const before = text.slice(0, index + 1);
  const match = before.match(/([A-Za-z](?:[A-Za-z]|\.){0,12})\.$/);
  return match ? match[1].toLowerCase() : "";
}

function shouldSplitAt(text, index) {
  const char = text[index];
  if (![".", "?", "!"].includes(char)) return false;

  if (char === ".") {
    const token = getPreviousToken(text, index);
    if (ABBREVIATIONS.has(token)) return false;
    if (/\d\.\d$/.test(text.slice(Math.max(0, index - 3), index + 1))) return false;
  }

  const after = text.slice(index + 1);
  if (!after.trim()) return true;

  const boundary = after.match(/^["')\]]*\s+/);
  if (!boundary) return false;

  const next = after.slice(boundary[0].length).trimStart()[0];
  return !next || /[A-Z0-9]/.test(next);
}

function splitLineIntoSentences(line) {
  const normalized = cleanText(line).replace(/\s+/g, " ");
  if (!normalized) return [];

  const sentences = [];
  let start = 0;

  for (let i = 0; i < normalized.length; i += 1) {
    if (!shouldSplitAt(normalized, i)) continue;

    const sentence = normalized.slice(start, i + 1).trim();
    if (sentence) sentences.push(sentence);
    start = i + 1;
  }

  const tail = normalized.slice(start).trim();
  if (tail) sentences.push(tail);

  return sentences.length ? sentences : [normalized];
}

function splitIntoSentenceLikeUnits(text) {
  const lines = cleanText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const units = [];
  for (const line of lines) {
    units.push(...splitLineIntoSentences(line));
  }

  return units;
}

function splitLongUnit(unit, page, maxWords) {
  const words = cleanText(unit).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return [{ text: cleanText(unit), page }];
  }

  const segments = [];
  for (let i = 0; i < words.length; i += maxWords) {
    segments.push({
      text: words.slice(i, i + maxWords).join(" "),
      page,
    });
  }

  return segments;
}

function buildSegmentsFromPages(pages, maxWords) {
  const segments = [];

  for (const page of pages || []) {
    const pageNumber = Number(page.page);
    const units = splitIntoSentenceLikeUnits(page.text);

    for (const unit of units) {
      segments.push(...splitLongUnit(unit, pageNumber, maxWords));
    }
  }

  return segments.filter((segment) => segment.text && Number.isFinite(segment.page));
}

function getUniquePages(segments) {
  return [...new Set(segments.map((segment) => segment.page))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function buildChunk(segments, source, chunkIndex, options) {
  const content = cleanText(segments.map((segment) => segment.text).join(" "));
  const pages = getUniquePages(segments);
  const wordCount = countWords(content);

  return {
    content,
    source,
    page: pages[0] || null,
    metadata: {
      chunk_index: chunkIndex,
      source,
      pages,
      page_range: formatPageRange(pages),
      word_count: wordCount,
      chunk_size_words: options.chunkSizeWords,
      overlap_words: options.overlapWords,
    },
  };
}

function chooseNextStart(segments, start, end, overlapWords) {
  let overlapCount = 0;
  let nextStart = end;

  while (nextStart > start && overlapCount < overlapWords) {
    nextStart -= 1;
    overlapCount += countWords(segments[nextStart].text);
  }

  if (nextStart <= start) return end;
  return nextStart;
}

function chunkPages(pages, options = {}) {
  const chunkSizeWords = options.chunkSizeWords || DEFAULT_CHUNK_SIZE_WORDS;
  const overlapWords = options.overlapWords ?? DEFAULT_OVERLAP_WORDS;
  const source = options.source || "LIT_Knowledge_Base.pdf";

  if (chunkSizeWords <= 0) {
    throw new Error("Chunk size must be greater than 0 words.");
  }

  if (overlapWords < 0 || overlapWords >= chunkSizeWords) {
    throw new Error("Chunk overlap must be greater than or equal to 0 and smaller than chunk size.");
  }

  const segments = buildSegmentsFromPages(pages, chunkSizeWords);
  if (!segments.length) return [];

  const chunks = [];
  let start = 0;

  while (start < segments.length) {
    let end = start;
    let wordCount = 0;

    while (end < segments.length) {
      const segmentWords = countWords(segments[end].text);
      if (end > start && wordCount + segmentWords > chunkSizeWords) break;

      wordCount += segmentWords;
      end += 1;

      if (wordCount >= chunkSizeWords) break;
    }

    if (end === start) end += 1;

    const chunkSegments = segments.slice(start, end);
    chunks.push(buildChunk(chunkSegments, source, chunks.length, { chunkSizeWords, overlapWords }));

    if (end >= segments.length) break;
    start = chooseNextStart(segments, start, end, overlapWords);
  }

  return chunks;
}

module.exports = {
  DEFAULT_CHUNK_SIZE_WORDS,
  DEFAULT_OVERLAP_WORDS,
  chunkPages,
  splitIntoSentenceLikeUnits,
};
