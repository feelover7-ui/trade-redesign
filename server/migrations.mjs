/** Additive v2 migration; never rebuild or reset existing business tables. */
export function migrateEnhancements(db) {
  const version=Number(db.prepare('PRAGMA user_version').get().user_version);
  if(version>5)throw new Error('Database version is newer than this application. Do not downgrade.');
  if(version===5)return;
  if(version<2){
  db.exec(`BEGIN IMMEDIATE;
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
  }
  if(version<3){
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS import_images(id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES import_batches(id),sheet TEXT NOT NULL,row_number INTEGER NOT NULL,end_row INTEGER NOT NULL,column_number INTEGER NOT NULL,name TEXT NOT NULL,bytes BLOB NOT NULL,sha256 TEXT NOT NULL,file_id TEXT REFERENCES files(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS catalog_cache(query_hash TEXT PRIMARY KEY,payload TEXT NOT NULL,fetched_at TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_usage(day TEXT NOT NULL,org_id TEXT NOT NULL,calls INTEGER NOT NULL,PRIMARY KEY(day,org_id));
    CREATE TABLE IF NOT EXISTS catalog_images(lot_id TEXT PRIMARY KEY REFERENCES lots(id),suggestion_id TEXT NOT NULL,bytes BLOB NOT NULL,sha256 TEXT NOT NULL,source_url TEXT NOT NULL,reference_url TEXT NOT NULL,identifier TEXT NOT NULL,saved_by TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_import_images_batch ON import_images(batch_id);
    PRAGMA user_version=3;COMMIT;`);
  }
  if(version<4){
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS import_documents(
      batch_id TEXT PRIMARY KEY REFERENCES import_batches(id), kind TEXT NOT NULL,
      bytes BLOB NOT NULL, sha256 TEXT NOT NULL, derived_hash TEXT NOT NULL,
      derived_name TEXT NOT NULL, method TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    PRAGMA user_version=4;
    COMMIT;`);

  }
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS import_document_exports(
      batch_id TEXT PRIMARY KEY REFERENCES import_documents(batch_id),
      bytes BLOB NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL);
    PRAGMA user_version=5;COMMIT;`);

}
