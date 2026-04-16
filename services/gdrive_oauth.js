const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

const TOKEN_PATH = path.join(__dirname, "..", ".tokens", "gdrive_token.json");

let cachedOAuth2Client = null;

function ensureTokenDir() {
  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Google OAuth env vars. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.",
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  const scopes = ["https://www.googleapis.com/auth/drive"];

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });
}

async function saveTokenFromCode(authCode) {
  ensureTokenDir();

  const rawInput = String(authCode || "").trim();
  let normalizedCode = rawInput;

  if (rawInput.startsWith("http://") || rawInput.startsWith("https://")) {
    try {
      const parsedUrl = new URL(rawInput);
      normalizedCode = parsedUrl.searchParams.get("code") || "";
    } catch (_error) {
      const match = rawInput.match(/[?&]code=([^&]+)/i);
      normalizedCode = match && match[1] ? decodeURIComponent(match[1]) : "";
    }
  }

  if (!normalizedCode) {
    throw new Error(
      "Authorization code is missing. Paste the Google code or full callback URL.",
    );
  }

  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(normalizedCode);

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  cachedOAuth2Client = null;

  return tokens;
}

function hasValidToken() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      return tokens && (tokens.access_token || tokens.refresh_token);
    }
  } catch (error) {
    console.error("Error reading token file:", error.message);
  }
  return false;
}

function getAuthenticatedClient() {
  if (cachedOAuth2Client) {
    return cachedOAuth2Client;
  }

  if (!hasValidToken()) {
    throw new Error("No valid OAuth token. User must authenticate first.");
  }

  ensureTokenDir();
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);

  cachedOAuth2Client = oauth2Client;
  return oauth2Client;
}

function clearToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
  cachedOAuth2Client = null;
}

module.exports = {
  getAuthUrl,
  saveTokenFromCode,
  hasValidToken,
  getAuthenticatedClient,
  clearToken,
};
