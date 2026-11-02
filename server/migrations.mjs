/** Additive migrations; never rebuild or reset existing business tables. */
export function migrateEnhancements(db) {
  const version=Number(db.prepare('PRAGMA user_version').get().user_version);
  if(version>3)throw new Error('Database version is newer than this application. Do not downgrade.');
  if(version<2)db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS import_batches(
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      created_by TEXT NOT NULL REFERENCES users(id), file_hash TEXT NOT NULL,
      name TEXT NOT NULL, workbook TEXT NOT NULL CHECK(json_valid(workbook)), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS import_receipts(
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      request_hash TEXT NOT NULL, result TEXT NOT NULL CHECK(json_valid(result)), created_at TEXT NOT NULL,
      UNIQUE(org_id,request_hash));
    CREATE TABLE IF NOT EXISTS imported_rows(
      org_id TEXT NOT NULL REFERENCES organizations(id), file_hash TEXT NOT NULL,
      sheet TEXT NOT NULL, row_number INTEGER NOT NULL, lot_id TEXT NOT NULL REFERENCES lots(id),
      PRIMARY KEY(org_id,file_hash,sheet,row_number));
    CREATE TABLE IF NOT EXISTS photo_metadata(
      file_id TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
      product_name TEXT NOT NULL DEFAULT '', purpose TEXT NOT NULL DEFAULT 'OVERVIEW',
      updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS product_suggestions(
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      lot_id TEXT NOT NULL REFERENCES lots(id), creator_id TEXT NOT NULL REFERENCES users(id),
      source TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', lot_version INTEGER NOT NULL,
      input_hash TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)),
      state TEXT NOT NULL DEFAULT 'PROPOSED', created_at TEXT NOT NULL, applied_at TEXT);
    CREATE TABLE IF NOT EXISTS shipping_quotes(
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
      created_by TEXT NOT NULL REFERENCES users(id), lot_id TEXT REFERENCES lots(id),
      input TEXT NOT NULL CHECK(json_valid(input)), result TEXT NOT NULL CHECK(json_valid(result)),
      created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_suggestions_lot ON product_suggestions(org_id,lot_id,created_at);
    CREATE INDEX IF NOT EXISTS idx_imports_org ON import_batches(org_id,created_at);
    CREATE INDEX IF NOT EXISTS idx_shipping_org ON shipping_quotes(org_id,created_at);
    PRAGMA user_version=2;
    COMMIT;`);
  if(version<3){
    db.exec('BEGIN IMMEDIATE');
    try{
      db.exec(`CREATE TABLE feedback(
        id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
        user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('FEATURE','BUG','USABILITY','OTHER')),
        body TEXT NOT NULL, page TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','REVIEWING','DONE','DEFERRED')),
        reply TEXT NOT NULL DEFAULT '', responded_by TEXT REFERENCES users(id),
        request_key TEXT NOT NULL, payload_hash TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,request_key));
        CREATE TABLE feedback_attachments(
          feedback_id TEXT NOT NULL REFERENCES feedback(id),
          file_id TEXT PRIMARY KEY REFERENCES files(id),
          UNIQUE(feedback_id,file_id));
        CREATE INDEX idx_feedback_user ON feedback(user_id,created_at);
        CREATE INDEX idx_feedback_status ON feedback(status,created_at);
        PRAGMA user_version=3;`);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
}
