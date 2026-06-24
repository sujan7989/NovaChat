import { createLogger } from "./logger.js";

const logger = createLogger("ai");

// Groq is optional — if no API key, AI features are silently disabled
let groq = null;
const MODEL = "llama3-8b-8192";

async function getGroq() {
  if (groq !== null) return groq;
  if (!process.env.GROQ_API_KEY) {
    logger.warn("GROQ_API_KEY not set — AI features (icebreakers, summaries) are disabled");
    groq = false; // mark as checked, don't retry
    return false;
  }
  try {
    const { default: Groq } = await import("groq-sdk");
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    logger.info("Groq AI client initialized");
    return groq;
  } catch (err) {
    logger.error(`Failed to initialize Groq client: ${err.message}`);
    groq = false;
    return false;
  }
}

/**
 * Generate an icebreaker question based on shared interests/vibes
 */
export async function generateIcebreaker(sharedInterests, vibes) {
  const client = await getGroq();
  if (!client) return null;

  try {
    const context = sharedInterests?.length
      ? `They both like: ${sharedInterests.join(", ")}.`
      : vibes?.length
      ? `Their vibe: ${vibes.join(", ")}.`
      : "They are anonymous strangers.";

    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [{
        role: "user",
        content: `You are a fun conversation starter for an anonymous chat app. Generate ONE short, friendly icebreaker question (max 15 words) for two strangers. ${context} Just the question, no extra text.`,
      }],
      max_tokens: 40,
      temperature: 0.9,
    });

    return res.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    logger.error(`Icebreaker error: ${err.message}`);
    return null;
  }
}

/**
 * Summarize a conversation
 */
export async function summarizeConversation(messages) {
  const client = await getGroq();
  if (!client) return null;

  try {
    if (!messages || messages.length < 4) return null;

    const transcript = messages
      .filter(m => m.type === "text" && !m.text?.startsWith("👋") && !m.text?.startsWith("👻"))
      .slice(-30) // last 30 messages max
      .map(m => `${m.from === "me" ? "User" : "Stranger"}: ${m.text}`)
      .join("\n");

    if (!transcript.trim()) return null;

    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [{
        role: "user",
        content: `Summarize this anonymous chat conversation in 2-3 short sentences. Be friendly and neutral. Just the summary, no intro.\n\n${transcript}`,
      }],
      max_tokens: 80,
      temperature: 0.5,
    });

    return res.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    logger.error(`Summary error: ${err.message}`);
    return null;
  }
}
