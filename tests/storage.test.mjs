import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fixture,fileRecord} from './helpers.mjs';
import {hash} from '../server/auth.mjs';
import {createBackup,restoreBackup,verifyStorage} from '../scripts/storage.mjs';

test('백업·새 경로 복원은 DB/기관 계정/한글 첨부·원본을 보존하고 덮어쓰지 않음',async t=>{
  const root=mkdtempSync(join(tmpdir(),'trade-restore-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const source=join(root,'source');mkdirSync(source);mkdirSync(join(source,'uploads'));
  const f=fixture(join(source,'trade.sqlite'));
  const id=fileRecord(f,f.editor),bytes=Buffer.from('합성 시연 증빙');
  f.db.prepare('UPDATE files SET name=?,sha256=?,size=? WHERE id=?').run('한글_증빙.pdf',hash(bytes),bytes.length,id);
  writeFileSync(join(source,'uploads',id+'.bin'),bytes);f.db.close();
  const before=readFileSync(join(source,'trade.sqlite'));
  const backupDir=join(root,'backup');await createBackup(source,backupDir);
  assert.deepEqual(readFileSync(join(source,'trade.sqlite')),before);
  const restored=join(root,'restored');assert.equal(restoreBackup(backupDir,restored).users,6);
  assert.equal(verifyStorage(restored).files,1);
  assert.deepEqual(readFileSync(join(restored,'uploads',id+'.bin')),bytes);
  assert.throws(()=>restoreBackup(backupDir,restored),/이미 존재/);
  writeFileSync(join(backupDir,'uploads',id+'.bin'),'tampered');
  assert.throws(()=>restoreBackup(backupDir,join(root,'tampered')),/해시 불일치/);
  assert.equal(existsSync(join(root,'tampered')),false);
});
test('없는 저장소의 백업은 빈 DB를 생성하지 않고 실패',async t=>{
  const root=mkdtempSync(join(tmpdir(),'trade-missing-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  await assert.rejects(createBackup(join(root,'absent'),join(root,'backup')),/ENOENT/);
  assert.equal(existsSync(join(root,'absent')),false);assert.equal(existsSync(join(root,'backup')),false);
});
test('누락된 첨부가 있는 DB는 정상 백업으로 처리하지 않음',async t=>{
  const root=mkdtempSync(join(tmpdir(),'trade-files-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const source=join(root,'source');mkdirSync(source);const f=fixture(join(source,'trade.sqlite'));fileRecord(f,f.editor);f.db.close();
  await assert.rejects(createBackup(source,join(root,'backup')),/ENOENT/);
  assert.equal(existsSync(join(root,'backup')),false);
});
test('production에서 demo 실행은 환경 강제 변경으로 우회하지 않고 DB 생성 전에 차단',t=>{
  const root=mkdtempSync(join(tmpdir(),'trade-production-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const result=spawnSync(process.execPath,['scripts/demo.mjs'],{env:{...process.env,NODE_ENV:'production',DATA_DIR:join(root,'data')},encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/운영 환경에서 데모 계정/);assert.equal(existsSync(join(root,'data')),false);
});
