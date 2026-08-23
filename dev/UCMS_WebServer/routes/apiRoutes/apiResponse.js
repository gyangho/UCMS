const AUTHORITY_RANKS = {
  "미인증": 0,
  "일반": 1,
  "부원": 2,
  "임원진": 3,
  "부회장": 4,
  "회장": 5,
  admin: 6,
};

function authorityRank(authority) {
  if (typeof authority === "number") return authority;
  if (authority === null || authority === undefined) return 0;
  if (AUTHORITY_RANKS[authority] !== undefined) return AUTHORITY_RANKS[authority];
  const numeric = Number(authority);
  return Number.isFinite(numeric) ? numeric : 0;
}

// 2026-08-21: MySQL ENUM numeric sessions are one-based from 일반 onward; convert them before semantic rank checks.
function sessionAuthorityRank(authority) {
  if (typeof authority === "number") {
    return authority <= 1 ? Math.max(0, authority) : authority - 1;
  }
  return authorityRank(authority);
}

function authorityLabel(authority) {
  if (typeof authority === "string" && AUTHORITY_RANKS[authority] !== undefined) {
    return authority;
  }
  const entry = Object.entries(AUTHORITY_RANKS).find(
    ([, rank]) => rank === Number(authority)
  );
  return entry ? entry[0] : "부원";
}

function ok(res, data = {}) {
  return res.json({ success: true, data });
}

function created(res, data = {}) {
  return res.status(201).json({ success: true, data });
}

function fail(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function requireAuthority(minAuthority = 4) {
  return (req, res, next) => {
    if (sessionAuthorityRank(req.session?.authority) < minAuthority) {
      return fail(res, 403, "FORBIDDEN", "Authority is required.");
    }
    return next();
  };
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function toDate(value) {
  if (!value) return null;
  return toIso(value)?.slice(0, 10) ?? null;
}

module.exports = {
  authorityLabel,
  authorityRank,
  asyncHandler,
  created,
  fail,
  ok,
  requireAuthority,
  sessionAuthorityRank,
  toDate,
  toIso,
};
