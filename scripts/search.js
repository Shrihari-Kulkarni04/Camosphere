const { embedQuery } = require("./embeddings");
const { matchDocuments, matchLocalTextDocuments } = require("./vectorStore");
const { cleanText, getEnvNumber, toErrorMessage, truncateForPrompt } = require("./utils");

let vectorRetrievalDisabledUntil = 0;
let warnedAboutVectorFallback = false;

function stripSources(text) {
  return cleanText(text).replace(/\n*Source:\s*[\s\S]*$/i, "").trim();
}

function buildContextualQuery(question, history = []) {
  const currentQuestion = cleanText(question);
  const recentHistory = history
    .slice(-6)
    .map((message) => {
      const role = message.role === "assistant" ? "Guava AI" : "User";
      return `${role}: ${truncateForPrompt(stripSources(message.content), 500)}`;
    })
    .filter((line) => !line.endsWith(":"));

  if (!recentHistory.length) return currentQuestion;

  return [
    "Conversation context for resolving follow-up questions:",
    ...recentHistory,
    `Current question: ${currentQuestion}`,
  ].join("\n");
}

async function searchKnowledgeBase(question, options = {}) {
  const topK = options.topK || getEnvNumber("RAG_TOP_K", 5, { min: 1, max: 20 });
  const matchThreshold =
    options.matchThreshold ?? getEnvNumber("RAG_MATCH_THRESHOLD", 0.45, { min: -1, max: 1 });
  const vectorRetryAfterMs = getEnvNumber("RAG_VECTOR_RETRY_AFTER_MS", 10 * 60 * 1000, {
    min: 1000,
  });

  const query = buildContextualQuery(question, options.history || []);
  let matches;
  let retrievalMode = "vector";

  try {
    if (Date.now() < vectorRetrievalDisabledUntil) {
      throw new Error("Vector retrieval is temporarily disabled after a recent embedding/vector failure.");
    }

    try {
      const queryEmbedding = await embedQuery(query);
      matches = await matchDocuments(queryEmbedding, {
        topK,
        matchThreshold,
      });
    } catch (error) {
      vectorRetrievalDisabledUntil = Date.now() + vectorRetryAfterMs;
      throw error;
    }
  } catch (error) {
    retrievalMode = "local_text";
    if (!warnedAboutVectorFallback) {
      warnedAboutVectorFallback = true;
      console.warn(`Vector retrieval unavailable. Using local text retrieval: ${toErrorMessage(error)}`);
    }
    matches = await matchLocalTextDocuments(query, {
      topK,
    });
  }

  return {
    query,
    matches,
    retrievalMode,
  };
}

module.exports = {
  buildContextualQuery,
  searchKnowledgeBase,
};
