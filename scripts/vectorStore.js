const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  batchArray,
  cleanText,
  getEnvNumber,
  loadEnv,
  toErrorMessage,
} = require("./utils");

let supabaseClient;
let warnedAboutFallbackKey = false;
let warnedAboutLocalMemoryFallback = false;
let localIndexCache = null;
let localTextIndexCache = null;
let localMemoryCache = null;

const LOCAL_INDEX_PATH = path.join(__dirname, "..", "knowledge", "vector-index.json");
const LOCAL_TEXT_INDEX_PATH = path.join(__dirname, "..", "knowledge", "text-index.json");
const LOCAL_MEMORY_PATH = path.join(__dirname, "..", "knowledge", "conversation-memory.json");
const KNOWLEDGE_FILE = "LIT_Knowledge_Base.pdf";
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "please",
  "tell",
  "that",
  "the",
  "their",
  "there",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
]);

function getSupabaseConfig() {
  loadEnv();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("Missing SUPABASE_URL. Add it to your local .env file or server environment.");
  }

  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Server-side RAG needs a Supabase service role key for ingestion and search."
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !warnedAboutFallbackKey) {
    warnedAboutFallbackKey = true;
    console.warn(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Falling back to SUPABASE_ANON_KEY for server-side RAG."
    );
  }

  return { url, key };
}

function getSupabaseClient() {
  const { url, key } = getSupabaseConfig();
  const cacheKey = `${url}:${key.slice(0, 12)}`;

  if (supabaseClient && supabaseClient.cacheKey === cacheKey) {
    return supabaseClient.client;
  }

  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        "X-Client-Info": "camosphere-rag",
      },
    },
  });

  supabaseClient = { cacheKey, client };
  return client;
}

function canUseLocalFallback() {
  return process.env.RAG_DISABLE_LOCAL_FALLBACK !== "true";
}

function isMissingSupabaseSchema(error) {
  const message = toErrorMessage(error).toLowerCase();
  const code = error && error.code;

  return (
    code === "PGRST202" ||
    code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("could not find the function") ||
    message.includes("match_documents")
  );
}

function parseEmbedding(embedding) {
  if (Array.isArray(embedding)) {
    return embedding.map(Number);
  }

  if (typeof embedding === "string") {
    return embedding
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value));
  }

  return [];
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tokenize(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9@._+-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function keywordScore(query, content) {
  const queryTerms = tokenize(query);
  if (!queryTerms.length) return 0;

  const contentText = cleanText(content).toLowerCase();
  const contentTerms = tokenize(contentText);
  const contentTermSet = new Set(contentTerms);

  let score = 0;
  for (const term of queryTerms) {
    if (contentTermSet.has(term)) score += 2;
    if (term.length > 3 && contentText.includes(term)) score += 1;
  }

  const uniqueQueryTerms = [...new Set(queryTerms)];
  const coverage =
    uniqueQueryTerms.filter((term) => contentTermSet.has(term) || contentText.includes(term)).length /
    uniqueQueryTerms.length;

  const exactNameMatch = query.match(/\b(?:dr|prof|mr|mrs|ms)\.?\s+[a-z]+(?:\s+[a-z]+){0,3}/i);
  if (exactNameMatch && contentText.includes(exactNameMatch[0].toLowerCase().replace(/\s+/g, " "))) {
    score += 10;
  }

  return Math.min(1, coverage * 0.75 + score / 100);
}

function ensureKnowledgeDirectory() {
  const knowledgeDir = path.join(__dirname, "..", "knowledge");
  if (!fs.existsSync(knowledgeDir)) {
    fs.mkdirSync(knowledgeDir, { recursive: true });
  }
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`Unable to read ${filePath}: ${toErrorMessage(error)}`);
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  ensureKnowledgeDirectory();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeLocalDocument(document) {
  return {
    id: document.id || crypto.randomUUID(),
    content: document.content,
    metadata: document.metadata || {},
    embedding: parseEmbedding(document.embedding),
    source: document.source || document.metadata?.source || KNOWLEDGE_FILE,
    page: document.page || document.metadata?.pages?.[0] || null,
  };
}

function normalizeLocalIndex(index) {
  const documents = Array.isArray(index?.documents) ? index.documents : [];

  return {
    version: 1,
    source: index?.source || KNOWLEDGE_FILE,
    created_at: index?.created_at || new Date().toISOString(),
    embedding_model: index?.embedding_model || process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
    documents: documents.map(normalizeLocalDocument).filter((document) => {
      return document.content && document.embedding.length;
    }),
  };
}

async function buildLocalVectorIndex() {
  const { chunkPages } = require("./chunker");
  const { embedChunks, getEmbeddingConfig } = require("./embeddings");
  const { extractPdfPages } = require("./utils");

  const pdfPath = path.join(__dirname, "..", "knowledge", KNOWLEDGE_FILE);
  const chunkSizeWords = getEnvNumber("RAG_CHUNK_SIZE_WORDS", 600, { min: 50 });
  const overlapWords = getEnvNumber("RAG_CHUNK_OVERLAP_WORDS", 100, { min: 0 });

  console.warn("Supabase vector schema is unavailable. Building local vector index from PDF.");

  const extracted = await extractPdfPages(pdfPath);
  const chunks = chunkPages(extracted.pages, {
    source: KNOWLEDGE_FILE,
    chunkSizeWords,
    overlapWords,
  });

  if (!chunks.length) {
    throw new Error("Local vector fallback could not create chunks from the knowledge base PDF.");
  }

  const embeddedChunks = await embedChunks(chunks, {
    onProgress: (completed, total) => {
      if (completed === total || completed % 5 === 0) {
        console.log(`Local vector index embedded ${completed}/${total} chunk(s).`);
      }
    },
  });

  const index = normalizeLocalIndex({
    version: 1,
    source: KNOWLEDGE_FILE,
    created_at: new Date().toISOString(),
    embedding_model: getEmbeddingConfig().modelName,
    documents: embeddedChunks.map((document) => ({
      id: crypto.randomUUID(),
      content: document.content,
      metadata: document.metadata || {},
      embedding: document.embedding,
      source: document.source || document.metadata?.source || KNOWLEDGE_FILE,
      page: document.page || document.metadata?.pages?.[0] || null,
    })),
  });

  writeJsonFile(LOCAL_INDEX_PATH, index);
  localIndexCache = index;

  return index;
}

async function getLocalVectorIndex() {
  if (localIndexCache) return localIndexCache;

  const existing = normalizeLocalIndex(readJsonFile(LOCAL_INDEX_PATH, null));
  if (existing.documents.length) {
    localIndexCache = existing;
    return existing;
  }

  throw new Error(
  "Local PDF fallback is disabled. Configure Supabase vector search instead."
);
}

async function matchLocalDocuments(queryEmbedding, options = {}) {
  const topK = options.topK || getEnvNumber("RAG_TOP_K", 5, { min: 1, max: 20 });
  const matchThreshold =
    options.matchThreshold ?? getEnvNumber("RAG_MATCH_THRESHOLD", 0.45, { min: -1, max: 1 });
  const normalizedQuery = parseEmbedding(queryEmbedding);
  const index = await getLocalVectorIndex();

  const matches = index.documents
    .map((document) => ({
      id: document.id,
      content: document.content,
      metadata: document.metadata || {},
      source: document.source,
      page: document.page,
      similarity: cosineSimilarity(normalizedQuery, document.embedding),
    }))
    .filter((document) => document.similarity >= matchThreshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return matches;
}

function normalizeLocalTextIndex(index) {
  const documents = Array.isArray(index?.documents) ? index.documents : [];

  return {
    version: 1,
    source: index?.source || KNOWLEDGE_FILE,
    created_at: index?.created_at || new Date().toISOString(),
    documents: documents
      .map((document) => ({
        id: document.id || crypto.randomUUID(),
        content: document.content,
        metadata: document.metadata || {},
        source: document.source || document.metadata?.source || KNOWLEDGE_FILE,
        page: document.page || document.metadata?.pages?.[0] || null,
      }))
      .filter((document) => document.content),
  };
}

async function buildLocalTextIndex() {
  const { chunkPages } = require("./chunker");
  const { extractPdfPages } = require("./utils");

  const pdfPath = path.join(__dirname, "..", "knowledge", KNOWLEDGE_FILE);
  const chunkSizeWords = getEnvNumber("RAG_CHUNK_SIZE_WORDS", 600, { min: 50 });
  const overlapWords = getEnvNumber("RAG_CHUNK_OVERLAP_WORDS", 100, { min: 0 });
  const extracted = await extractPdfPages(pdfPath);
  const chunks = chunkPages(extracted.pages, {
    source: KNOWLEDGE_FILE,
    chunkSizeWords,
    overlapWords,
  });

  const index = normalizeLocalTextIndex({
    version: 1,
    source: KNOWLEDGE_FILE,
    created_at: new Date().toISOString(),
    documents: chunks.map((chunk) => ({
      id: crypto.randomUUID(),
      content: chunk.content,
      metadata: chunk.metadata || {},
      source: chunk.source || KNOWLEDGE_FILE,
      page: chunk.page,
    })),
  });

  writeJsonFile(LOCAL_TEXT_INDEX_PATH, index);
  localTextIndexCache = index;

  return index;
}

async function getLocalTextIndex() {
  if (localTextIndexCache) return localTextIndexCache;

  const existing = normalizeLocalTextIndex(readJsonFile(LOCAL_TEXT_INDEX_PATH, null));
  if (existing.documents.length) {
    localTextIndexCache = existing;
    return existing;
  }

throw new Error(
  "Local PDF fallback is disabled."
);
}

async function matchLocalTextDocuments(queryText, options = {}) {
  const topK = options.topK || getEnvNumber("RAG_TOP_K", 5, { min: 1, max: 20 });
  const textMatchThreshold =
    options.textMatchThreshold ?? getEnvNumber("RAG_TEXT_MATCH_THRESHOLD", 0.05, { min: 0, max: 1 });
  const index = await getLocalTextIndex();

  return index.documents
    .map((document) => ({
      id: document.id,
      content: document.content,
      metadata: document.metadata || {},
      source: document.source,
      page: document.page,
      similarity: keywordScore(queryText, document.content),
    }))
    .filter((document) => document.similarity >= textMatchThreshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

function readLocalMemory() {
  if (localMemoryCache) return localMemoryCache;

  localMemoryCache = readJsonFile(LOCAL_MEMORY_PATH, {
    version: 1,
    conversations: {},
  });

  if (!localMemoryCache.conversations) {
    localMemoryCache.conversations = {};
  }

  return localMemoryCache;
}

function writeLocalMemory(memory) {
  localMemoryCache = memory;
  writeJsonFile(LOCAL_MEMORY_PATH, memory);
}

function getLocalConversation(sessionId) {
  const memory = readLocalMemory();

  if (!memory.conversations[sessionId]) {
    const now = new Date().toISOString();
    memory.conversations[sessionId] = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      created_at: now,
      updated_at: now,
      messages: [],
    };
    writeLocalMemory(memory);
  }

  return {
    ...memory.conversations[sessionId],
    local: true,
  };
}

function getLocalConversationHistory(sessionId, limit) {
  const conversation = getLocalConversation(sessionId);
  return conversation.messages.slice(-limit);
}

function appendLocalConversationMessage(sessionId, role, content) {
  const memory = readLocalMemory();
  const conversation = getLocalConversation(sessionId);

  memory.conversations[sessionId] = {
    ...conversation,
    updated_at: new Date().toISOString(),
    messages: [
      ...(conversation.messages || []),
      {
        id: crypto.randomUUID(),
        role,
        content,
        created_at: new Date().toISOString(),
      },
    ],
  };

  delete memory.conversations[sessionId].local;
  writeLocalMemory(memory);
}

function trimLocalConversationHistory(sessionId, maxMessages) {
  const memory = readLocalMemory();
  const conversation = getLocalConversation(sessionId);
  const messages = conversation.messages || [];
  const trimmed = messages.slice(-maxMessages);

  memory.conversations[sessionId] = {
    ...conversation,
    messages: trimmed,
    updated_at: new Date().toISOString(),
  };

  delete memory.conversations[sessionId].local;
  writeLocalMemory(memory);

  return messages.length - trimmed.length;
}

async function deleteDocumentsBySource(source) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("documents").delete().eq("source", source);

  if (error) {
    throw new Error(`Failed to delete existing documents for ${source}: ${error.message}`);
  }
}

async function deleteDocumentsBySourceExceptRun(source, ingestRunId) {
  const supabase = getSupabaseClient();
  const query = supabase.from("documents").delete().eq("source", source);

  if (ingestRunId) {
    query.neq("metadata->>ingest_run_id", ingestRunId);
  }

  const { error } = await query;
  if (error) {
    throw new Error(`Failed to clean up previous documents for ${source}: ${error.message}`);
  }
}

async function insertDocuments(documents, options = {}) {
  if (!Array.isArray(documents) || !documents.length) {
    throw new Error("No embedded documents were provided for insertion.");
  }

  const supabase = getSupabaseClient();
  const batchSize = options.batchSize || getEnvNumber("SUPABASE_INSERT_BATCH_SIZE", 25, {
    min: 1,
    max: 200,
  });

  let inserted = 0;
  const batches = batchArray(documents, batchSize);

  for (const batch of batches) {
    const rows = batch.map((document) => ({
      content: document.content,
      metadata: document.metadata || {},
      embedding: document.embedding,
      source: document.source || document.metadata?.source || "LIT_Knowledge_Base.pdf",
      page: document.page || document.metadata?.pages?.[0] || null,
    }));

    const { error } = await supabase.from("documents").insert(rows);
    if (error) {
      throw new Error(`Failed to insert document batch: ${error.message}`);
    }

    inserted += rows.length;
    if (typeof options.onProgress === "function") {
      options.onProgress(inserted, documents.length);
    }
  }

  writeJsonFile(
    LOCAL_INDEX_PATH,
    normalizeLocalIndex({
      version: 1,
      source: documents[0]?.source || documents[0]?.metadata?.source || KNOWLEDGE_FILE,
      created_at: new Date().toISOString(),
      embedding_model: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
      documents,
    })
  );

  return inserted;
}

async function matchDocuments(queryEmbedding, options = {}) {
  const topK = options.topK || getEnvNumber("RAG_TOP_K", 5, { min: 1, max: 20 });
  const matchThreshold =
    options.matchThreshold ?? getEnvNumber("RAG_MATCH_THRESHOLD", 0.45, { min: -1, max: 1 });

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (error) {
    if (canUseLocalFallback()) {
      throw new Error(`Supabase unavailable. Local text retrieval required: ${toErrorMessage(error)}`);
    }

    throw error;
  }

  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: topK,
    match_threshold: matchThreshold,
  });

  if (error) {
    if (canUseLocalFallback() && isMissingSupabaseSchema(error)) {
      throw new Error(`Supabase vector RPC unavailable. Local text retrieval required: ${error.message}`);
    }

    throw new Error(`Vector search failed: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    content: row.content,
    metadata: row.metadata || {},
    source: row.source,
    page: row.page,
    similarity: Number(row.similarity),
  }));
}

async function getOrCreateConversation(sessionId) {
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (error) {
    if (canUseLocalFallback()) {
      if (!warnedAboutLocalMemoryFallback) {
        warnedAboutLocalMemoryFallback = true;
        console.warn(`Supabase memory unavailable. Using local memory fallback: ${toErrorMessage(error)}`);
      }
      return getLocalConversation(sessionId);
    }

    throw error;
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("rag_conversations")
    .upsert(
      {
        session_id: sessionId,
        updated_at: now,
      },
      {
        onConflict: "session_id",
      }
    )
    .select("id, session_id")
    .single();

  if (error) {
    if (canUseLocalFallback() && isMissingSupabaseSchema(error)) {
      if (!warnedAboutLocalMemoryFallback) {
        warnedAboutLocalMemoryFallback = true;
        console.warn(`Supabase memory schema unavailable. Using local memory fallback: ${error.message}`);
      }
      return getLocalConversation(sessionId);
    }

    throw new Error(`Failed to load conversation memory: ${error.message}`);
  }

  return data;
}

async function getConversationHistory(sessionId, limit = 8) {
  const conversation = await getOrCreateConversation(sessionId);
  if (conversation.local) {
    return getLocalConversationHistory(sessionId, limit);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("rag_conversation_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (canUseLocalFallback() && isMissingSupabaseSchema(error)) {
      return getLocalConversationHistory(sessionId, limit);
    }

    throw new Error(`Failed to read conversation history: ${error.message}`);
  }

  return (data || []).reverse();
}

async function appendConversationMessage(sessionId, role, content) {
  const conversation = await getOrCreateConversation(sessionId);
  if (conversation.local) {
    appendLocalConversationMessage(sessionId, role, content);
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("rag_conversation_messages").insert({
    conversation_id: conversation.id,
    role,
    content,
  });

  if (error) {
    if (canUseLocalFallback() && isMissingSupabaseSchema(error)) {
      appendLocalConversationMessage(sessionId, role, content);
      return;
    }

    throw new Error(`Failed to write conversation message: ${error.message}`);
  }
}

async function trimConversationHistory(sessionId, maxMessages = 16) {
  const conversation = await getOrCreateConversation(sessionId);
  if (conversation.local) {
    return trimLocalConversationHistory(sessionId, maxMessages);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("rag_conversation_messages")
    .select("id")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .range(maxMessages, 1000);

  if (error) {
    if (canUseLocalFallback() && isMissingSupabaseSchema(error)) {
      return trimLocalConversationHistory(sessionId, maxMessages);
    }

    throw new Error(`Failed to inspect old conversation messages: ${error.message}`);
  }

  const ids = (data || []).map((row) => row.id);
  if (!ids.length) return 0;

  const { error: deleteError } = await supabase
    .from("rag_conversation_messages")
    .delete()
    .in("id", ids);

  if (deleteError) {
    if (canUseLocalFallback() && isMissingSupabaseSchema(deleteError)) {
      return trimLocalConversationHistory(sessionId, maxMessages);
    }

    throw new Error(`Failed to trim conversation history: ${deleteError.message}`);
  }

  return ids.length;
}

async function safeMemoryWrite(operation) {
  try {
    return await operation();
  } catch (error) {
    console.warn(`Conversation memory warning: ${toErrorMessage(error)}`);
    return null;
  }
}

module.exports = {
  appendConversationMessage,
  deleteDocumentsBySource,
  deleteDocumentsBySourceExceptRun,
  getConversationHistory,
  getOrCreateConversation,
  getSupabaseClient,
  insertDocuments,
  matchLocalDocuments,
  matchLocalTextDocuments,
  matchDocuments,
  safeMemoryWrite,
  trimConversationHistory,
};
