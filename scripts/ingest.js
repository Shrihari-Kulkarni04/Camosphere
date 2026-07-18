const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { chunkPages } = require("./chunker");
const { embedChunks } = require("./embeddings");
const {
  cleanText,
  extractPdfPages,
  getEnvNumber,
  loadEnv,
  toErrorMessage,
} = require("./utils");
const {
  deleteDocumentsBySource,
  insertDocuments,
} = require("./vectorStore");

const KNOWLEDGE_FILE = "LIT_Knowledge_Base.pdf";

async function ingest() {
  loadEnv();

  const dryRun = process.argv.includes("--dry-run");
  const pdfPath = path.join(__dirname, "..", "knowledge", KNOWLEDGE_FILE);
  const extractedPath = path.join(__dirname, "..", "knowledge", "extracted.txt");
  const chunkSizeWords = getEnvNumber("RAG_CHUNK_SIZE_WORDS", 600, { min: 50 });
  const overlapWords = getEnvNumber("RAG_CHUNK_OVERLAP_WORDS", 100, { min: 0 });
  const ingestRunId = crypto.randomUUID();

  console.log(`Reading PDF: ${pdfPath}`);
  const extracted = await extractPdfPages(pdfPath);

  fs.writeFileSync(extractedPath, extracted.text, "utf8");
  console.log(`Extracted ${extracted.totalPages} page(s) to ${extractedPath}`);

  const chunks = chunkPages(extracted.pages, {
    source: KNOWLEDGE_FILE,
    chunkSizeWords,
    overlapWords,
  }).map((chunk) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      ingest_run_id: ingestRunId,
      pdf_pages: extracted.totalPages,
    },
  }));

  if (!chunks.length) {
    throw new Error("PDF extraction completed, but no chunks were produced.");
  }

  console.log(`Created ${chunks.length} chunk(s).`);
  console.log(`Chunk size: ${chunkSizeWords} words. Overlap: ${overlapWords} words.`);

  if (dryRun) {
    console.log("Dry run enabled. Skipping embeddings and Supabase inserts.");
    console.log("\nFirst chunk preview:\n");
    console.log(cleanText(chunks[0].content).slice(0, 1200));
    return {
      dryRun: true,
      pages: extracted.totalPages,
      chunks: chunks.length,
    };
  }

  console.log("Generating Gemini embeddings...");
  const embeddedChunks = await embedChunks(chunks, {
    onProgress: (completed, total) => {
      if (completed === total || completed % 5 === 0) {
        console.log(`Embedded ${completed}/${total} chunk(s).`);
      }
    },
  });

  console.log(`Replacing existing rows for source: ${KNOWLEDGE_FILE}`);
  await deleteDocumentsBySource(KNOWLEDGE_FILE);

  console.log("Inserting embedded chunks into Supabase...");
  const inserted = await insertDocuments(embeddedChunks, {
    onProgress: (completed, total) => {
      console.log(`Inserted ${completed}/${total} document row(s).`);
    },
  });

  console.log("RAG ingestion complete.");
  console.log(`Inserted rows: ${inserted}`);
  console.log(`Ingest run id: ${ingestRunId}`);

  return {
    dryRun: false,
    pages: extracted.totalPages,
    chunks: chunks.length,
    inserted,
    ingestRunId,
  };
}

if (require.main === module) {
  ingest().catch((error) => {
    console.error(`Ingestion failed: ${toErrorMessage(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  ingest,
};
