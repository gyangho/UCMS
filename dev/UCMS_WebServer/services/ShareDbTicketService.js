const crypto = require("crypto");

const TICKET_TTL_SECONDS = 5 * 60;
const MIN_SECRET_BYTES = 32;

function getSecret() {
  const secret = process.env.SHAREDB_AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error(
      "SHAREDB_AUTH_SECRET must contain at least 32 bytes of secret data.",
    );
  }
  return secret;
}

// 2026-08-19: Issue a short-lived, document-scoped credential instead of exposing the Express session to the WebSocket service.
function createShareDbTicket({ userId, authority, documentId, formId }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + TICKET_TTL_SECONDS;
  const payload = {
    version: 1,
    subject: String(userId),
    authority: Number(authority),
    documentId: String(documentId),
    formId: String(formId),
    issuedAt,
    expiresAt,
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(encodedPayload)
    .digest("base64url");

  return {
    ticket: `${encodedPayload}.${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

module.exports = {
  createShareDbTicket,
};
