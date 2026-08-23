const db = require("../models/db");
const Pos = require("../models/Pos");
const { sessionAuthorityRank } = require("../routes/apiRoutes/apiResponse");

// 2026-08-20: Verify that both the legacy 0.0.1 schema and 0.1.1 additions are queryable through Node's DB driver.
async function smokeDatabaseSchema() {
  // 2026-08-21: Prevent MySQL ENUM ordinals from granting member sessions executive management access.
  const authorityCases = [
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 3],
    [5, 4],
    [7, 6],
    ["부원", 2],
    ["임원진", 3],
  ];
  for (const [storedAuthority, expectedRank] of authorityCases) {
    if (sessionAuthorityRank(storedAuthority) !== expectedRank) {
      throw new Error(`Authority normalization failed for ${storedAuthority}.`);
    }
  }

  const requiredTables = [
    "users",
    "members",
    "events",
    "formlist",
    "recruiting_members",
    "sessions",
    "notice_posts",
    "inquiry_posts",
    "inquiry_comments",
    "pos_instances",
    "user_reauthentication_audits",
    "user_impersonation_audits",
    "email_auth_challenges",
    "trusted_login_devices",
    "password_reset_requests",
    "recruitment_instances",
    "recruitment_posters",
    "interview_slot_locations",
  ];

  const placeholders = requiredTables.map(() => "?").join(", ");
  const [tables] = await db.execute(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (${placeholders})`,
    requiredTables,
  );
  const foundTables = new Set(tables.map((row) => row.TABLE_NAME ?? row.table_name));
  const missingTables = requiredTables.filter((table) => !foundTables.has(table));
  if (missingTables.length > 0) {
    throw new Error(`Missing tables: ${missingTables.join(", ")}`);
  }

  const requiredPosColumns = [
    "created_by",
    "created_at",
    "updated_at",
    "closed_at",
    "poster_file_name",
    "poster_mime_type",
    "poster_pdf",
    "auto_close_at",
    "promotion_copy",
  ];
  const [columns] = await db.execute(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'pos_instances'`,
  );
  const foundColumns = new Set(
    columns.map((row) => row.COLUMN_NAME ?? row.column_name),
  );
  const missingColumns = requiredPosColumns.filter(
    (column) => !foundColumns.has(column),
  );
  if (missingColumns.length > 0) {
    throw new Error(`Missing pos_instances columns: ${missingColumns.join(", ")}`);
  }

  const requiredUserColumns = [
    "account_email",
    "phone_number",
    "status",
    "kakao_linked_at",
    "last_login_at",
    "account_type",
    "system_key",
    "system_authority",
    "password_hash",
    "email_verified_at",
    "student_id",
    "major",
  ];
  const [userColumns] = await db.execute(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'`,
  );
  const foundUserColumns = new Set(
    userColumns.map((row) => row.COLUMN_NAME ?? row.column_name),
  );
  const missingUserColumns = requiredUserColumns.filter(
    (column) => !foundUserColumns.has(column),
  );
  if (missingUserColumns.length > 0) {
    throw new Error(`Missing users columns: ${missingUserColumns.join(", ")}`);
  }

  // 2026-08-22: The UI automation administrator is credential-less and receives authority only as a system identity.
  const [systemAdmins] = await db.execute(
    `SELECT account_type, system_authority, kakao_id
       FROM users
      WHERE system_key = 'ui-test-admin'`,
  );
  if (
    systemAdmins.length !== 1 ||
    systemAdmins[0].account_type !== "system" ||
    systemAdmins[0].system_authority !== "admin" ||
    systemAdmins[0].kakao_id !== null
  ) {
    throw new Error("The system UI test administrator is missing or unsafe.");
  }

  const [interviewColumns] = await db.execute(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'interview_plans'`,
  );
  if (!interviewColumns.some((row) => (row.COLUMN_NAME ?? row.column_name) === "recruitment_id")) {
    throw new Error("Missing interview_plans.recruitment_id.");
  }

  const [productColumns] = await db.execute(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'pos_products'`,
  );
  if (!productColumns.some((row) => (row.COLUMN_NAME ?? row.column_name) === "initial_stock")) {
    throw new Error("Missing pos_products.initial_stock.");
  }

  // 2026-08-20: Authentication codes and legacy room bindings must not return in the response-only chatbot design.
  const [retiredSchema] = await db.execute(
    `SELECT
       (SELECT COUNT(*)
          FROM information_schema.tables
         WHERE table_schema = DATABASE()
           AND table_name IN ('pending_auth', 'group_chat_rooms')) AS retired_tables,
       (SELECT COUNT(*)
          FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = 'users'
           AND column_name = 'chat_room_id') AS retired_columns`,
  );
  if (
    Number(retiredSchema[0]?.retired_tables) !== 0 ||
    Number(retiredSchema[0]?.retired_columns) !== 0
  ) {
    throw new Error("Legacy Bot authentication schema still exists.");
  }

  await db.execute("SELECT 1 FROM events LIMIT 1");

  // 2026-08-21: Exercise automatic closing and sale-rate calculation only in the disposable migration DB.
  const [expiredResult] = await db.execute(
    `INSERT INTO pos_instances (instance_name, status, auto_close_at)
     VALUES ('__SMOKE_EXPIRED_POS__', 'active', DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE))`,
  );
  try {
    await Pos.closeExpiredInstances();
    const [expiredRows] = await db.execute(
      "SELECT status, closed_at FROM pos_instances WHERE id = ?",
      [expiredResult.insertId],
    );
    if (expiredRows[0]?.status !== "closed" || !expiredRows[0]?.closed_at) {
      throw new Error("Expired POS was not closed automatically.");
    }
  } finally {
    await db.execute("DELETE FROM pos_instances WHERE id = ?", [expiredResult.insertId]);
  }

  const [promotionResult] = await db.execute(
    "INSERT INTO pos_instances (instance_name, status) VALUES ('__SMOKE_PROMOTION_POS__', 'active')",
  );
  try {
    await db.execute(
      `INSERT INTO pos_products (instance_id, product_name, product_price, stock, initial_stock)
       VALUES (?, 'smoke product', 1000, 4, 10)`,
      [promotionResult.insertId],
    );
    const promotion = await Pos.getActivePromotion();
    if (
      Number(promotion?.id) !== Number(promotionResult.insertId) ||
      Number(promotion?.sold_quantity) !== 6 ||
      Math.abs(Number(promotion?.sale_rate) - 0.6) > Number.EPSILON
    ) {
      throw new Error("POS promotion sale rate is incorrect.");
    }
  } finally {
    await db.execute("DELETE FROM pos_instances WHERE id = ?", [promotionResult.insertId]);
  }
  console.log("Node schema smoke test passed.");
}

smokeDatabaseSchema()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
