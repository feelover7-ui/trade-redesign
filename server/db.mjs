import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {migrateEnhancements} from './migrations.mjs';

export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export function openDatabase(file = resolve(process.env.DATA_DIR || './data', 'trade.sqlite')) {
  if (file !== ':memory:') mkdirSync(dirname(file), {recursive:true, mode:0o700});
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS organizations(id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, type TEXT NOT NULL CHECK(type IN ('PUBLIC_SCHOOL','EDUCATION_OFFICE','AFFILIATED')), district TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, verified_note TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('EDITOR','REVIEWER','ADMIN')), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS lots(id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), creator_id TEXT NOT NULL REFERENCES users(id), data TEXT NOT NULL CHECK(json_valid(data)), source_snapshot TEXT NOT NULL CHECK(json_valid(source_snapshot)), state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','REVIEW','PUBLISHED','PAUSED','CLOSED')), decision_status TEXT NOT NULL DEFAULT 'UNVERIFIED', reviewer_id TEXT REFERENCES users(id), review_note TEXT NOT NULL DEFAULT '', reviewed_at TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS groups(id TEXT PRIMARY KEY, lot_id TEXT NOT NULL REFERENCES lots(id), condition TEXT NOT NULL CHECK(condition IN ('GOOD','USED','REPAIR','UNKNOWN')), quantity INTEGER NOT NULL CHECK(quantity>0), inspection TEXT NOT NULL CHECK(inspection IN ('ALL','SAMPLE','NONE')), note TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), lot_id TEXT REFERENCES lots(id), request_id TEXT, kind TEXT NOT NULL CHECK(kind IN ('PHOTO','EVIDENCE')), name TEXT NOT NULL, mime TEXT NOT NULL, disk_name TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), external_id TEXT NOT NULL, original_name TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), lot_id TEXT REFERENCES lots(id), import_hash TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(org_id,external_id));
  CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), sender_org TEXT NOT NULL REFERENCES organizations(id), receiver_org TEXT NOT NULL REFERENCES organizations(id), created_by TEXT NOT NULL REFERENCES users(id), quantity INTEGER NOT NULL CHECK(quantity>0), purpose TEXT NOT NULL, pickup_date TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(state IN ('REQUESTED','RESERVED','SENT','RECEIVED','DISPUTED','DONE','DECLINED','CANCELLED')), sent_quantity INTEGER NOT NULL DEFAULT 0 CHECK(sent_quantity>=0), received_quantity INTEGER NOT NULL DEFAULT 0 CHECK(received_quantity>=0), note TEXT NOT NULL DEFAULT '', request_key TEXT NOT NULL, payload_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(receiver_org,request_key));
  CREATE TABLE IF NOT EXISTS case_assets(request_id TEXT NOT NULL REFERENCES requests(id), asset_id TEXT NOT NULL REFERENCES assets(id), quantity INTEGER NOT NULL CHECK(quantity>0), PRIMARY KEY(request_id,asset_id));
  CREATE TABLE IF NOT EXISTS case_steps(request_id TEXT NOT NULL REFERENCES requests(id), step TEXT NOT NULL, reference TEXT NOT NULL, file_id TEXT NOT NULL REFERENCES files(id), checked_by TEXT NOT NULL REFERENCES users(id), checked_org TEXT NOT NULL, checked_at TEXT NOT NULL, PRIMARY KEY(request_id,step));
  CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id), user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS favorites(user_id TEXT NOT NULL REFERENCES users(id), lot_id TEXT NOT NULL REFERENCES lots(id), PRIMARY KEY(user_id,lot_id));
  CREATE TABLE IF NOT EXISTS audit_events(id TEXT PRIMARY KEY, org_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, entity_id TEXT NOT NULL, detail TEXT NOT NULL CHECK(json_valid(detail)), created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_lots_org ON lots(org_id,state);
  CREATE INDEX IF NOT EXISTS idx_requests_group ON requests(group_id,state);
  CREATE INDEX IF NOT EXISTS idx_requests_orgs ON requests(sender_org,receiver_org,state);
  CREATE INDEX IF NOT EXISTS idx_files_lot ON files(lot_id);
  CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_events(org_id,created_at);
  CREATE TRIGGER IF NOT EXISTS publish_gate BEFORE UPDATE OF state ON lots WHEN NEW.state='PUBLISHED' AND (NEW.decision_status<>'VERIFIED' OR NEW.reviewer_id IS NULL OR NEW.reviewer_id=NEW.creator_id) BEGIN SELECT RAISE(ABORT,'PUBLISH_REQUIRES_INDEPENDENT_REVIEW'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'AUDIT_APPEND_ONLY'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'AUDIT_APPEND_ONLY'); END;
  CREATE TRIGGER IF NOT EXISTS asset_snapshot_immutable BEFORE UPDATE OF snapshot,quantity,external_id,original_name ON assets BEGIN SELECT RAISE(ABORT,'ORIGINAL_ASSET_IMMUTABLE'); END;
  `);
  migrateEnhancements(db);
  return db;
}
export function transaction(db, fn) { const nested=db.isTransaction; const savepoint='sp_'+uid().replaceAll('-',''); db.exec(nested?`SAVEPOINT ${savepoint}`:'BEGIN IMMEDIATE'); try {const result=fn(); db.exec(nested?`RELEASE ${savepoint}`:'COMMIT'); return result;} catch(error) {db.exec(nested?`ROLLBACK TO ${savepoint}`:'ROLLBACK'); if(nested)db.exec(`RELEASE ${savepoint}`); throw error;} }
export function audit(db, actor, action, entity, detail={}) {db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').run(uid(),actor.org_id,actor.id,action,entity,JSON.stringify(detail),now());}
export function fail(message, status=400, code='VALIDATION_ERROR') {const e=new Error(message);e.status=status;e.code=code;throw e;}
export function must(value,message,status=400,code='VALIDATION_ERROR') {if(!value) fail(message,status,code);}
