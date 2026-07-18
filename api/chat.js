const OpenAI = require("openai");

const {
  getConversationHistory,
  appendConversationMessage,
  getSupabaseClient,
} = require("./../scripts/vectorStore");

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_TEMPERATURE = 0.2;
const GROQ_MAX_TOKENS = 350;
const KNOWLEDGE_TABLE = "knowledge_base";
const KNOWLEDGE_COLUMNS = "question, answer, keywords, aliases, category, priority";
const MAX_CONTEXT_ROWS = 6;
const HISTORY_LIMIT = 6;

const ASSISTANT_NAME = "Guava AI";
const INSTITUTE_NAME = "Laxmi Institute of Technology (LIT), Sarigam";
const PROJECT_NAME = "CAMOSPHERE Virtual Campus Tour";
const TEAM_NAME = "CAMOSPHERE Team";
const TEAM_MEMBERS = ["Krish Singh", "Prassidhi Mishra", "Shreya Rai", "Shrihari Kulkarni"];

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "how", "i", "in", "is", "it", "of", "on", "or", "please", "tell",
  "that", "the", "their", "there", "this", "to", "was", "what",
  "when", "where", "which", "who", "why", "you", "your", "me",
  "can", "could", "would", "will", "do", "does", "did", "about",
  "give", "know", "want", "need", "hi", "hello", "hey",
]);

const ABBREVIATION_MAP = {
  cse: ["computer science", "computer science engineering", "computer science and engineering"],
  cs: ["computer science"],
  it: ["information technology"],
  ece: ["electronics and communication", "electronics and communication engineering"],
  eee: ["electrical and electronics", "electrical and electronics engineering"],
  me: ["mechanical", "mechanical engineering"],
  mech: ["mechanical", "mechanical engineering"],
  ce: ["civil", "civil engineering"],
  civil: ["civil engineering"],
  hod: ["head of department", "head", "department head"],
  principal: ["director", "principal"],
  lit: ["laxmi institute of technology"],
};

const GREETING_PATTERN = /\b(hi|hello|hey|good\s?morning|good\s?evening|good\s?afternoon|namaste|namaskar|thanks|thank\s?you|thankyou|bye|goodbye|see\s?you)\b/i;

const IDENTITY_PATTERN = /\b(who\s+are\s+you|what\s+are\s+you|your\s+name|who\s+(made|built|developed|created)\s+you|who\s+is\s+your\s+developer|developer\s+team|development\s+team|camosphere\s+team|about\s+yourself)\b/i;

const OFF_TOPIC_PATTERN = /\b(prime\s?minister|president\s+of\s+india|chief\s+minister|movie|film|actor|actress|bollywood|hollywood|weather\s+today|cricket\s+score|ipl|football|fifa|politics|election|stock\s+market|share\s+price|recipe|song\s+lyrics|joke|write\s+(a\s+)?(code|program|script)|programming\s+tutorial|leetcode|algorithm\s+question|capital\s+of|history\s+of\s+world)\b/i;

function safeString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalize(text) {
  return safeString(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectIntent(message) {
  const raw = safeString(message).trim();
  if (!raw) return "greeting";

  if (IDENTITY_PATTERN.test(raw)) return "identity";

  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  if (GREETING_PATTERN.test(raw) && wordCount <= 6) return "greeting";

  if (OFF_TOPIC_PATTERN.test(raw)) return "offtopic";

  return "campus";
}

function expandAbbreviations(tokens) {
  const expanded = new Set(tokens);

  for (const token of tokens) {
    const expansions = ABBREVIATION_MAP[token];
    if (!expansions) continue;

    for (const phrase of expansions) {
      for (const word of phrase.split(" ")) {
        if (word.length > 2 && !STOPWORDS.has(word)) {
          expanded.add(word);
        }
      }
    }
  }

  return [...expanded];
}

function buildSearchTokens(message) {
  const normalized = normalize(message);
  if (!normalized) return [];

  const rawTokens = normalized
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));

  const uniqueTokens = [...new Set(rawTokens)];
  return expandAbbreviations(uniqueTokens).slice(0, 25);
}

function buildOrFilter(tokens) {
  const filters = tokens.flatMap((word) => {
    const escaped = word.replace(/[%,()]/g, "");
    if (!escaped) return [];

    return [
      `question.ilike.%${escaped}%`,
      `answer.ilike.%${escaped}%`,
      `keywords.ilike.%${escaped}%`,
      `aliases.ilike.%${escaped}%`,
      `category.ilike.%${escaped}%`,
    ];
  });

  return filters.join(",");
}

async function fetchCandidateRows(supabase, tokens) {
  if (!tokens.length) return [];

  const orFilter = buildOrFilter(tokens);
  if (!orFilter) return [];

  const { data, error } = await supabase
    .from(KNOWLEDGE_TABLE)
    .select(KNOWLEDGE_COLUMNS)
    .or(orFilter)
    .order("priority", { ascending: false })
    .limit(40);

  if (error) throw error;
  return data || [];
}

function fieldScore(fieldText, tokens, rawQueryLower, weight) {
  if (!fieldText) return 0;

  const lowerField = safeString(fieldText).toLowerCase();
  let score = 0;

  if (rawQueryLower && lowerField.includes(rawQueryLower)) {
    score += weight * 12;
  }

  for (const token of tokens) {
    if (lowerField.includes(token)) {
      score += weight;
    }
  }

  return score;
}

function scoreRow(row, tokens, rawQueryLower) {
  let score = 0;

  score += fieldScore(row.aliases, tokens, rawQueryLower, 6);
  score += fieldScore(row.keywords, tokens, rawQueryLower, 5);
  score += fieldScore(row.question, tokens, rawQueryLower, 4);
  score += fieldScore(row.category, tokens, rawQueryLower, 2);
  score += fieldScore(row.answer, tokens, rawQueryLower, 1);

  const priority = Number(row.priority);
  if (Number.isFinite(priority)) {
    score += priority * 0.5;
  }

  return score;
}

function rankRows(rows, tokens, message) {
  const rawQueryLower = normalize(message);

  return rows
    .map((row) => ({ row, score: scoreRow(row, tokens, rawQueryLower) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.row);
}

function dedupeRows(rows) {
  const seen = new Set();
  const result = [];

  for (const row of rows) {
    const key = `${safeString(row.question)}::${safeString(row.answer)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }

  return result;
}

async function retrieveKnowledge(supabase, message) {
  const tokens = buildSearchTokens(message);

  try {
    const candidates = await fetchCandidateRows(supabase, tokens);
    const ranked = dedupeRows(rankRows(candidates, tokens, message));
    return ranked.slice(0, MAX_CONTEXT_ROWS);
  } catch (error) {
    console.error("Knowledge retrieval error:", error);
    return [];
  }
}

function buildContextBlock(rows) {
  if (!rows.length) return "";

  return rows
    .map(
      (row) => `
Category: ${row.category || "General"}

Question:
${row.question || ""}

Answer:
${row.answer || ""}
`
    )
    .join("\n----------------------\n");
}

function buildIdentityBlock() {
  return `
ASSISTANT IDENTITY (use only if the user asks who you are, your name, or who built you):
Name: ${ASSISTANT_NAME}
Institute: ${INSTITUTE_NAME}
Project: ${PROJECT_NAME}
Developed by: ${TEAM_NAME}
Team members: ${TEAM_MEMBERS.join(", ")}
`;
}

function buildSystemPrompt({ intent, contextBlock }) {
  const identityBlock = buildIdentityBlock();

  return `
You are ${ASSISTANT_NAME}, the official AI assistant of ${INSTITUTE_NAME}.

Your job is to answer ONLY questions related to LIT (admissions, departments, faculty, fees, hostel, transport, library, facilities, placements, events, and similar campus topics).

LANGUAGE RULE
Always reply in the SAME language and style the user used in their latest message.
- If the user writes in English, reply in English.
- If the user writes in Hindi, reply in Hindi.
- If the user writes in Hinglish (mixed Hindi-English), reply in Hinglish.
- If the user writes in Marathi, reply in Marathi.
- If the user writes in Gujarati, reply in Gujarati.
Never force any specific language. Match the user naturally.

CORE RULES
1. Use ONLY the information provided below to answer campus-related questions. Never invent or guess facts.
2. If multiple pieces of information are relevant, combine them naturally into one clear answer.
3. If the user's question is ambiguous or ambiguous between multiple topics, politely ask ONE short clarifying question, for example: "Could you please specify whether you are asking about hostel fees or admission fees?"
4. Never mention or reveal, under any circumstances: knowledge base, database, CSV, context, retrieved information, internal data, or how you found the answer.
5. If the answer cannot be found in the information provided, do NOT say the knowledge base is unavailable. Instead reply naturally, for example: "I couldn't understand exactly what you are referring to. Could you please provide a little more detail so I can assist you better?"
6. Never answer questions unrelated to LIT (general knowledge, politics, entertainment, weather, programming help, etc.). Politely explain that you only assist with LIT-related queries, in the user's language.
7. Be concise, respectful, and professional.
8. Do not use bullet points unless the user explicitly asks for a list.
9. If the user greets you or thanks you, respond warmly and briefly without forcing campus information into the reply.
10. If the user asks about your identity or who developed you, answer using the ASSISTANT IDENTITY details below, in the user's language.

${identityBlock}

DETECTED INTENT FOR THIS MESSAGE: ${intent}

CAMPUS INFORMATION AVAILABLE FOR THIS QUESTION:
${contextBlock || "(No specific matching information was found for this question.)"}
`;
}

function extractSessionId(req) {
  return req.headers["x-session-id"] || req.ip || "default-session";
}

function mapHistoryForGroq(history) {
  return (history || [])
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .map((message) => ({
      role: message.role,
      content: safeString(message.content),
    }));
}

async function generateReply({ message, history, intent, contextBlock }) {
  const systemPrompt = buildSystemPrompt({ intent, contextBlock });

  const completion = await client.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...mapHistoryForGroq(history),
      { role: "user", content: message },
    ],
    temperature: GROQ_TEMPERATURE,
    max_tokens: GROQ_MAX_TOKENS,
  });

  return completion.choices[0].message.content;
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method Not Allowed",
    });
  }

  try {
    const message = safeString(req.body && req.body.message).trim();

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message is required.",
      });
    }

    const sessionId = extractSessionId(req);
    const intent = detectIntent(message);

    const [history, supabase] = [
      await getConversationHistory(sessionId, HISTORY_LIMIT),
      getSupabaseClient(),
    ];

    let contextBlock = "";
    if (intent === "campus") {
      const rows = await retrieveKnowledge(supabase, message);
      contextBlock = buildContextBlock(rows);
    }

    const replyText = await generateReply({
      message,
      history,
      intent,
      contextBlock,
    });

    await appendConversationMessage(sessionId, "user", message);
    await appendConversationMessage(sessionId, "assistant", replyText);

    return res.status(200).json({
      success: true,
      message: replyText,
    });
  } catch (error) {
    console.error("Guava AI chat error:", error);
    console.error(error && error.stack);

    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
      // TEMP DEBUG — remove "stack" before going live
      stack: error && error.stack,
    });
  }
}

module.exports = handler;