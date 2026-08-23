const db = require("../models/db");
const {
  isImpersonationMutationBlocked,
  listImpersonationTargets,
  startUserImpersonation,
  stopUserImpersonation,
} = require("../services/UserImpersonationService");

const TEST_STUDENT_ID = "9999900099";
const TEST_ADMIN_NAME = "__IMPERSONATION_SMOKE_ADMIN__";
const TEST_TARGET_NAME = "__IMPERSONATION_SMOKE_TARGET__";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createMockRequest(userId) {
  let generation = 0;
  const req = { sessionID: "impersonation-smoke-0", session: null };

  function createSession(values = {}) {
    return {
      ...values,
      regenerate(callback) {
        generation += 1;
        req.sessionID = `impersonation-smoke-${generation}`;
        req.session = createSession();
        callback();
      },
      save(callback) {
        callback();
      },
      destroy(callback) {
        req.session = null;
        callback();
      },
    };
  }

  req.session = createSession({
    userId,
    authority: 7,
  });
  return req;
}

async function cleanup() {
  const [testUsers] = await db.execute(
    "SELECT id FROM users WHERE name IN (?, ?)",
    [TEST_ADMIN_NAME, TEST_TARGET_NAME],
  );
  const ids = testUsers.map((user) => Number(user.id));
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(", ");
    await db.execute(
      `DELETE FROM user_impersonation_audits
        WHERE actor_user_id IN (${placeholders})
           OR target_user_id IN (${placeholders})`,
      [...ids, ...ids],
    );
  }
  await db.execute("DELETE FROM members WHERE student_id = ?", [TEST_STUDENT_ID]);
  await db.execute("DELETE FROM users WHERE name IN (?, ?)", [
    TEST_ADMIN_NAME,
    TEST_TARGET_NAME,
  ]);
}

// 2026-08-22: Verify system-admin mutation attribution, human-target read-only mode, exit, and audit rows.
async function smokeUserImpersonation() {
  if (
    process.env.MIGRATION_SMOKE_TEST !== "true" ||
    process.env.DB_NAME !== "ucms_migration_test"
  ) {
    throw new Error("Impersonation smoke test is restricted to ucms_migration_test.");
  }

  await cleanup();
  try {
    const [actorResult] = await db.execute(
      "INSERT INTO users (name, status) VALUES (?, 'active')",
      [TEST_ADMIN_NAME],
    );
    await db.execute(
      `INSERT INTO members
         (student_id, name, major, phone, gender, generation, authority, user_id)
       VALUES (?, ?, 'Test', '010-9000-0099', '남자', 1, 'admin', ?)`,
      [TEST_STUDENT_ID, TEST_ADMIN_NAME, actorResult.insertId],
    );
    const [targetResult] = await db.execute(
      "INSERT INTO users (name, status) VALUES (?, 'active')",
      [TEST_TARGET_NAME],
    );
    const [systemRows] = await db.execute(
      "SELECT id FROM users WHERE system_key = 'ui-test-admin'",
    );
    const systemAdminId = Number(systemRows[0]?.id);
    assert(systemAdminId > 0, "System test administrator is missing.");

    const targets = await listImpersonationTargets(actorResult.insertId);
    assert(
      targets[0]?.systemKey === "ui-test-admin" && targets[0]?.readOnly === false,
      "System test administrator is not the preferred mutable target.",
    );

    const req = createMockRequest(actorResult.insertId);
    const systemStart = await startUserImpersonation(
      req,
      systemAdminId,
      "migration smoke system test",
    );
    assert(systemStart.systemTestAccount, "System account impersonation was not identified.");
    assert(req.session.userId === systemAdminId, "Effective system user was not stored.");
    assert(req.session.authority === 7, "System admin authority was not stored safely.");
    assert(
      !isImpersonationMutationBlocked("POST", "/api/events", req.session.impersonation),
      "System test administrator mutations were unexpectedly blocked.",
    );
    assert(
      isImpersonationMutationBlocked(
        "POST",
        `/api/admin/users/${actorResult.insertId}/force-reauthentication`,
        req.session.impersonation,
      ),
      "System impersonation allowed a sensitive identity mutation.",
    );
    await stopUserImpersonation(req);
    assert(
      req.session.userId === actorResult.insertId && req.session.authority === 7,
      "Original human administrator was not restored.",
    );

    const humanStart = await startUserImpersonation(
      req,
      targetResult.insertId,
      "migration smoke read only",
    );
    assert(humanStart.readOnly, "Human impersonation was not read-only.");
    assert(
      isImpersonationMutationBlocked("POST", "/api/events", req.session.impersonation),
      "Human impersonation allowed a data mutation.",
    );
    assert(
      !isImpersonationMutationBlocked("GET", "/api/events", req.session.impersonation),
      "Human impersonation blocked a read request.",
    );
    assert(
      !isImpersonationMutationBlocked(
        "POST",
        "/api/admin/impersonation/exit",
        req.session.impersonation,
      ),
      "Human impersonation blocked its exit endpoint.",
    );
    await stopUserImpersonation(req);

    const [auditRows] = await db.execute(
      `SELECT action, read_only
         FROM user_impersonation_audits
        WHERE actor_user_id = ?
        ORDER BY id`,
      [actorResult.insertId],
    );
    assert(auditRows.length === 4, "Impersonation start/end audit rows are incomplete.");
    assert(
      Number(auditRows[0].read_only) === 0 && Number(auditRows[2].read_only) === 1,
      "Impersonation audit did not preserve mutation mode.",
    );

    console.log("User impersonation smoke test passed.");
  } finally {
    await cleanup();
  }
}

smokeUserImpersonation()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
