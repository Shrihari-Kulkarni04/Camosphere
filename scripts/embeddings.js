const { GoogleGenerativeAI, TaskType } = require("@google/generative-ai");
const {
  cleanText,
  getEnvNumber,
  loadEnv,
  normalizeEmbeddingVector,
  retry,
} = require("./utils");

const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
const DEFAULT_EMBEDDING_DIMENSIONS = 3072;

let embeddingModel;

function getEmbeddingConfig() {
  loadEnv();

  return {
    apiKey: process.env.GEMINI_API_KEY,
    modelName: process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    dimensions: getEnvNumber("GEMINI_EMBEDDING_DIMENSIONS", DEFAULT_EMBEDDING_DIMENSIONS, {
      min: 1,
    }),
    timeoutMs: getEnvNumber("GEMINI_EMBEDDING_TIMEOUT_MS", 30000, {
      min: 1000,
    }),
    retries: getEnvNumber("GEMINI_EMBEDDING_RETRIES", 3, {
      min: 0,
      max: 10,
    }),
  };
}

function assertGeminiKey(apiKey) {
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY. Add it to your local .env file or server environment.");
  }
}

function usesPromptTaskPrefixes(modelName) {
  return /gemini-embedding-2/i.test(modelName);
}

function prepareEmbeddingText(text, taskType, title, modelName) {
  const cleaned = cleanText(text);

  if (!usesPromptTaskPrefixes(modelName)) return cleaned;

  if (taskType === TaskType.RETRIEVAL_QUERY) {
    return `task: question answering | query: ${cleaned}`;
  }

  return `title: ${title || "LIT_Knowledge_Base.pdf"} | text: ${cleaned}`;
}

function getEmbeddingModel() {
  const config = getEmbeddingConfig();
  assertGeminiKey(config.apiKey);

  const cacheKey = `${config.modelName}:${config.timeoutMs}`;
  if (embeddingModel && embeddingModel.cacheKey === cacheKey) {
    return embeddingModel.model;
  }

  const genAI = new GoogleGenerativeAI(config.apiKey);
  const model = genAI.getGenerativeModel(
    {
      model: config.modelName,
    },
    {
      timeout: config.timeoutMs,
    }
  );

  embeddingModel = { cacheKey, model };
  return model;
}

function readEmbeddingValues(response) {
  const embedding =
    response.embedding ||
    (Array.isArray(response.embeddings) ? response.embeddings[0] : response.embeddings);

  if (!embedding) {
    throw new Error("Gemini embedding response did not include an embedding.");
  }

  if (Array.isArray(embedding)) return embedding;
  if (Array.isArray(embedding.values)) return embedding.values;

  throw new Error("Gemini embedding response has an unsupported shape.");
}

async function embedText(text, options = {}) {
  const config = getEmbeddingConfig();
  assertGeminiKey(config.apiKey);

  const cleaned = cleanText(text);
  if (!cleaned) {
    throw new Error("Cannot generate an embedding for empty text.");
  }

  const taskType = options.taskType || TaskType.RETRIEVAL_DOCUMENT;
  const title = options.title || "LIT_Knowledge_Base.pdf";
  const input = prepareEmbeddingText(cleaned, taskType, title, config.modelName);

  const request = {
    content: {
      role: "user",
      parts: [{ text: input }],
    },
  };

  if (!usesPromptTaskPrefixes(config.modelName)) {
    request.taskType = taskType;
    if (taskType === TaskType.RETRIEVAL_DOCUMENT) {
      request.title = title;
    }
  }

  const response = await retry(
    () => getEmbeddingModel().embedContent(request),
    {
      retries: config.retries,
      baseDelayMs: 750,
      label: "Gemini embedding",
    }
  );

  return normalizeEmbeddingVector(readEmbeddingValues(response), config.dimensions);
}

async function embedDocument(content, metadata = {}) {
  return embedText(content, {
    taskType: TaskType.RETRIEVAL_DOCUMENT,
    title: metadata.source || "LIT_Knowledge_Base.pdf",
  });
}

async function embedQuery(query) {
  return embedText(query, {
    taskType: TaskType.RETRIEVAL_QUERY,
    title: "User question",
  });
}

async function embedChunks(chunks, options = {}) {
  const concurrency = getEnvNumber("GEMINI_EMBEDDING_CONCURRENCY", options.concurrency || 1, {
    min: 1,
    max: 8,
  });

  const results = new Array(chunks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < chunks.length) {
      const index = nextIndex;
      nextIndex += 1;

      const chunk = chunks[index];
      const embedding = await embedDocument(chunk.content, chunk.metadata);
      results[index] = {
        ...chunk,
        embedding,
      };

      if (typeof options.onProgress === "function") {
        options.onProgress(index + 1, chunks.length, chunk);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

module.exports = {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  embedChunks,
  embedDocument,
  embedQuery,
  embedText,
  getEmbeddingConfig,
};
