const crypto = require("crypto");

const MIN_SECRET_BYTES = 32;

function requireAuthSecret() {
  const secret = process.env.SHAREDB_AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error(
      "SHAREDB_AUTH_SECRET must contain at least 32 bytes of secret data.",
    );
  }
  return secret;
}

function verifyShareDbTicket(ticket, secret = requireAuthSecret()) {
  if (typeof ticket !== "string") {
    throw new Error("Authentication ticket is required.");
  }

  const parts = ticket.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Authentication ticket format is invalid.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(parts[0])
    .digest();
  const receivedSignature = Buffer.from(parts[1], "base64url");
  if (
    receivedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    throw new Error("Authentication ticket signature is invalid.");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw new Error("Authentication ticket payload is invalid.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    payload.version !== 1 ||
    !payload.subject ||
    // 2026-08-22: REST tickets carry normalized ranks, so executive access starts at rank 3.
    Number(payload.authority) < 3 ||
    !payload.documentId ||
    !payload.formId ||
    !Number.isInteger(payload.expiresAt) ||
    payload.expiresAt <= now
  ) {
    throw new Error("Authentication ticket is expired or incomplete.");
  }

  return {
    userId: String(payload.subject),
    authority: Number(payload.authority),
    documentId: String(payload.documentId),
    formId: String(payload.formId),
    expiresAt: payload.expiresAt,
  };
}

module.exports = {
  requireAuthSecret,
  verifyShareDbTicket,
};
