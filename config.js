// eurographics/config.js
// Paste-only: hard disable any AI/network calls

export const AI_MODE = "off"; // "off" means: do not call any AI provider
export const USE_AI = false;

// Keep these names for compatibility with any imports, but they are empty.
export const OPENAI_API_KEY = "";
export const OPENROUTER_API_KEY = "";
export const MODEL = "";

// Safety: any code that tries to read a URL should get nothing.
export const AI_PROXY_URL = "";
export const OPENROUTER_URL = "";
