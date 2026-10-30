// @ts-nocheck
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {diffText,normalize,candidateDate} from '../diff';
import {openDb,initDemo,seedSources,replayAll,replayOne,getOverview,candidateDetails,reviewCandidate,createAction,updateAction,updateSource,makeDigest,FIXTURES,evidencePacket} from '../engine';

const seeded=()=>{const db=openDb(':memory:');initDemo(db);return db;};
const find=(db,sourceId)=>getOverview(db).candidates.filter(c=>c.source_id===sourceId);
test('five sources have three successful captures; timeout is incomplete coverage',()=>{
 const db=seeded(),data=getOverview(db);
 assert.equal(data.sources.length,5);assert.equal(data.stats.coverageFailures,1);
 for(const s of data.sources){assert.ok(s.versionsCount>=3);assert.ok(db.prepare('SELECT count(*) n FROM snapshots WHERE source_id=?').get(s.id).n>=3);}
 assert.equal(data.sources.find(s=>s.id==='access').status,'failure');db.close();
});
test('PDF quiet limit change has source path, both values and original bytes',()=>{
 const db=seeded(),c=candidateDetails(db,find(db,'housing')[0].id);
 assert.equal(c.source_path,'/documents/eligibility.pdf');
 assert.ok(c.hunks.some(h=>h.before_text.includes('$2,000')&&h.after_text.includes('$2,500')));
 assert.ok(db.prepare('SELECT length(original_bytes) n FROM document_versions WHERE id=?').get(c.after_version_id).n>1000);
 assert.equal(c.reviews.length,0);db.close();
});
test('changed URL with unchanged PDF preserves audit only, no duplicate candidate',()=>{
 const db=seeded();assert.equal(find(db,'housing').length,1);
 const record=db.prepare("SELECT metadata FROM audit_events WHERE event='source_path_changed'").get();
 assert.equal(JSON.parse(record.metadata).contentUnchanged,true);db.close();
});
test('navigation reordering and footer change are editorial',()=>{
 const db=seeded(),c=find(db,'youth').find(x=>x.change_kind==='editorial');assert.ok(c);
 const h=candidateDetails(db,c.id).hunks[0];assert.match(h.before_text,/\[NAV\]/);
 assert.equal(normalize(h.before_text),normalize(h.after_text));db.close();
});
test('deleted attachment is not evidence of policy withdrawal',()=>{
 const db=seeded(),c=getOverview(db).candidates.find(c=>c.change_kind==='disappeared');
 assert.ok(c);assert.match(c.summary,/not evidence of withdrawal/i);db.close();
});
test('ambiguous year remains unconfirmed; prompt injection does not create actions',()=>{
 const db=seeded(),c=find(db,'food').map(x=>candidateDetails(db,x.id)).find(x=>x.hunks.some(h=>h.after_text.includes('IGNORE PREVIOUS INSTRUCTIONS')));
 assert.ok(c);assert.equal(c.effective_date_candidate,null);assert.match(c.date_uncertainty,/without an unambiguous year/i);
 assert.equal(db.prepare('SELECT count(*) n FROM action_items').get().n,0);
 assert.throws(()=>createAction(db,c.id,{owner:'Person',dueDate:'2026-11-03'}),/human review/i);db.close();
});
test('OCR uncertainty is explicit',()=>{
 const db=seeded(),c=candidateDetails(db,find(db,'access')[0].id);
 assert.equal(c.document.extraction_uncertain,1);db.close();
});
test('replayed historical polls cannot duplicate candidates',()=>{
 const db=seeded(),count=db.prepare('SELECT count(*) n FROM change_candidates').get().n;
 replayAll(db);for(const s of FIXTURES.sources)replayOne(db,s.id,false);
 assert.equal(db.prepare('SELECT count(*) n FROM change_candidates').get().n,count);db.close();
});
test('normalizer is deterministic and distinguishes a numeric modification',()=>{
 const a='[NAV] A | B\nMaximum $2,000.\nFOOTER: draft',b='[NAV] B | A\nMaximum $2,500.\nFOOTER: new';
 assert.deepEqual(diffText(a,b),diffText(a,b));
 assert.deepEqual(diffText(a,b),[{kind:'modified',before:'Maximum $2,000.',after:'Maximum $2,500.',section:'Paragraph 1'}]);
 assert.equal(candidateDate('November 3').value,null);
});
test('human review through edit, acknowledge, resolution persists across process restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harbor-test-')),filename=path.join(dir,'db.sqlite');
 let db=openDb(filename);initDemo(db);
 const c=candidateDetails(db,find(db,'housing')[0].id);
 assert.throws(()=>createAction(db,c.id,{owner:'Morgan',dueDate:'2026-11-02'}),/human review/i);
 reviewCandidate(db,c.id,{classification:'relevant',reviewer:'Reviewer',note:'Inspected original',confirmedEffectiveDate:'2026-11-01'});
 const {id}=createAction(db,c.id,{owner:'Morgan',dueDate:'2026-11-05',note:'Review forms'});
 assert.throws(()=>updateAction(db,id,{owner:'Morgan',dueDate:'2026-11-06',status:'resolved',note:'Done'}),/Acknowledge/i);
 updateAction(db,id,{owner:'Morgan',dueDate:'2026-11-06',status:'acknowledged',note:'Reviewing forms'});
 updateAction(db,id,{owner:'Morgan',dueDate:'2026-11-06',status:'resolved',note:'Forms reviewed'});
 db.close();db=openDb(filename);initDemo(db);
 const a=getOverview(db).actions.find(a=>a.id===id);
 assert.equal(a.due_date,'2026-11-06');assert.equal(a.status,'resolved');assert.match(a.note,/Forms reviewed/);
 db.close();fs.rmSync(dir,{recursive:true,force:true});
});
test('source-policy updates are constrained and versioned',()=>{
 const db=seeded();
 assert.throws(()=>updateSource(db,'housing',{canonicalUrl:'http://127.0.0.1'}),/cannot change/i);
 assert.throws(()=>updateSource(db,'housing',{attachmentDepth:99}),/out of bounds/i);
 updateSource(db,'housing',{owner:'Morgan Revised',cadenceMinutes:60});
 assert.equal(db.prepare("SELECT count(*) n FROM source_policy_versions WHERE source_id='housing'").get().n,2);
 db.close();
});
test('digest remains local draft and contains coverage caveat',()=>{
 const db=seeded(),draft=makeDigest(db);
 assert.match(draft.body,/LOCAL DRAFT DIGEST/);assert.match(draft.body,/Coverage failures: 1/);
 assert.match(draft.body,/No external message sent/);
 assert.equal(db.prepare('SELECT count(*) n FROM digest_drafts').get().n,1);db.close();
});
test('source scope exclusion marks coverage incomplete, not attachment disappearance',()=>{
 const db=openDb(':memory:');seedSources(db);
 replayOne(db,'housing');updateSource(db,'housing',{attachmentDepth:0});replayOne(db,'housing');
 const s=getOverview(db).sources.find(s=>s.id==='housing');
 assert.equal(s.status,'failure');assert.match(s.error,/scope excluded/);
 assert.equal(find(db,'housing').length,0,'out-of-scope PDF not mislabelled as removed');
 db.close();
});

test('evidence receipt includes stable SHA-256, source provenance and preserved changes',()=>{
 const db=seeded(),c=find(db,'housing')[0];
 const p=evidencePacket(db,c.id),p2=evidencePacket(db,c.id);
 assert.equal(p.integrity.state,'verified');
 assert.equal(p.receiptSha256,p2.receiptSha256);
 assert.equal(p.receiptSha256.length,64);
 assert.equal(p.immutable.sourcePath,'/documents/eligibility.pdf');
 assert.ok(p.immutable.hunks.some(h=>h.before.includes('$2,000')&&h.after.includes('$2,500')));
 assert.equal(p.reviewHistory.length,0);
 db.close();
});
test('receipt flags tampered original bytes instead of claiming integrity',()=>{
 const db=seeded(),c=find(db,'housing')[0];
 db.prepare('UPDATE document_versions SET original_bytes=? WHERE id=?').run(Buffer.from('tampered PDF'),c.after_version_id);
 const receipt=evidencePacket(db,c.id);
 assert.equal(receipt.integrity.state,'failed');
 assert.ok(receipt.integrity.failures.some(f=>/original bytes/.test(f)));
 db.close();
});
test('later review and action do not change the immutable evidence receipt',()=>{
 const db=seeded(),c=find(db,'housing')[0],first=evidencePacket(db,c.id);
 reviewCandidate(db,c.id,{classification:'urgent',reviewer:'Human',note:'Checked original PDF'});
 createAction(db,c.id,{owner:'Operations',dueDate:'2026-11-04'});
 const second=evidencePacket(db,c.id);
 assert.equal(second.receiptSha256,first.receiptSha256);
 assert.equal(second.reviewHistory[0].classification,'urgent');
 assert.equal(second.action.owner,'Operations');db.close();
});
test('large diff does not allocate an unbounded LCS matrix',()=>{
 const before=Array.from({length:1000},(_,i)=>`Rule ${i}: $2,000`).join('\n');
 const after=before.replace('Rule 950: $2,000','Rule 950: $2,500');
 const hunks=diffText(before,after);
 assert.equal(hunks.length,1);assert.match(hunks[0].section,/coarse/);
 assert.ok(hunks[0].before.includes('$2,000')&&hunks[0].after.includes('$2,500'));
});

test('candidate detail reports local integrity status and receipt audit trail',()=>{
 const db=seeded(),c=find(db,'housing')[0];
 assert.equal(candidateDetails(db,c.id).evidenceIntegrity.state,'verified');
 reviewCandidate(db,c.id,{classification:'needs_domain_review',reviewer:'Domain expert',note:'Needs scan confirmation'});
 const packet=evidencePacket(db,c.id);
 assert.ok(packet.auditTrail.some(e=>e.event==='reviewed'&&e.actor==='Domain expert'));
 db.close();
});

test('resolved actions cannot be edited; repeated no-op updates do not create audits',()=>{
 const db=seeded(),c=find(db,'housing')[0];
 reviewCandidate(db,c.id,{classification:'relevant',reviewer:'QA',note:'Reviewed'});
 const id=createAction(db,c.id,{owner:'QA',dueDate:'2026-11-04',note:'Review form'}).id;
 const data={owner:'QA',dueDate:'2026-11-04',status:'assigned',note:'Review form'};
 const before=db.prepare("SELECT count(*) n FROM audit_events WHERE object_type='action'").get().n;
 assert.equal(updateAction(db,id,data).unchanged,true);
 assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE object_type='action'").get().n,before);
 updateAction(db,id,{...data,status:'acknowledged'});
 updateAction(db,id,{...data,status:'resolved',note:'Completed'});
 assert.throws(()=>updateAction(db,id,{...data,status:'resolved',note:'Revised after finalization'}),/immutable/);
 db.close();
});
test('assignment notes have a bounded length',()=>{
 const db=seeded(),c=find(db,'housing')[0];
 reviewCandidate(db,c.id,{classification:'relevant',reviewer:'QA',note:'Reviewed'});
 assert.throws(()=>createAction(db,c.id,{owner:'QA',dueDate:'2026-11-04',note:'X'.repeat(2001)}),/max 2000/);
 db.close();
});

test('invalid calendar dates are not silently normalized into false effective dates',()=>{
 const invalid=candidateDate('Notice effective February 31, 2026');
 assert.equal(invalid.value,null);
 assert.match(invalid.note,/invalid calendar date/);
 assert.equal(candidateDate('Notice effective February 29, 2028').value,'2028-02-29');
 assert.equal(candidateDate('Notice effective February 29, 2027').value,null);
});
