// @ts-nocheck
/** Persistent deterministic replay. No external source is contacted. */
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {candidateDate,diffText,normalize,NORMALIZER_VERSION} from './diff';

export const ORG = 'harbor-demo';
const sha=(data:any)=>crypto.createHash('sha256').update(data).digest('hex');
const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const fixtureRoot=path.resolve(__dirname,'../fixtures');
export const FIXTURES=JSON.parse(fs.readFileSync(path.join(fixtureRoot,'history.json'),'utf8'));

function audit(db,kind,objectId,event,actor='fixture-replay',metadata={}) {
  db.prepare('INSERT INTO audit_events(id,org_id,object_type,object_id,event,actor,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(uid(),ORG,kind,objectId,event,actor,JSON.stringify(metadata),now());
}
export function openDb(filename=':memory:') {
  if(filename!==':memory:')fs.mkdirSync(path.dirname(path.resolve(filename)),{recursive:true});
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  if(filename!==':memory:')db.exec('PRAGMA journal_mode=WAL;');
  db.exec(fs.readFileSync(path.resolve(__dirname,'../migrations/001_init.sql'),'utf8'));  return db;
}

function configRow(s) {return {
    name:s.name,canonicalUrl:s.canonical_url,allowedHost:s.allowed_host,
    documentTypes:JSON.parse(s.document_types),cadenceMinutes:s.cadence_minutes,
    attachmentDepth:s.attachment_depth,programLabels:JSON.parse(s.program_labels),
    timezone:s.timezone,owner:s.owner
  };}
export function seedSources(db) {
  for(const source of FIXTURES.sources){
    if(db.prepare('SELECT id FROM sources WHERE id=?').get(source.id))continue;
    db.prepare(`INSERT INTO sources(id,org_id,name,canonical_url,allowed_host,document_types,cadence_minutes,
      attachment_depth,program_labels,timezone,owner) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      source.id,ORG,source.name,source.canonicalUrl,source.allowedHost,JSON.stringify(source.documentTypes),
      source.cadenceMinutes,source.attachmentDepth,JSON.stringify(source.programLabels),source.timezone,source.owner);
    const row=db.prepare('SELECT * FROM sources WHERE id=?').get(source.id);
    db.prepare('INSERT INTO source_policy_versions(id,source_id,config,created_at,created_by) VALUES (?,?,?,?,?)')
      .run(uid(),source.id,JSON.stringify(configRow(row)),now(),'fixture-seed');
  }
}
function saveDoc(db,source,doc,retrievedAt){
  const bytes=doc.rawFile?fs.readFileSync(path.join(fixtureRoot,doc.rawFile)):Buffer.from(doc.text,'utf8');
  if(bytes.length>2_000_000)throw Error('Fixture exceeded 2 MB attachment bound');
  if(!source.documentTypes.includes(doc.contentType))throw Error('Document type is out of scope');
  if(doc.depth>source.attachmentDepth)throw Error('Attachment depth out of scope');
  const link=new URL(doc.path,source.canonicalUrl);
  if(link.protocol!=='https:'||link.hostname!==source.allowedHost)throw Error('Unapproved link host');
  const linkedId=sha(source.id+':'+doc.key).slice(0,32);
  db.prepare('INSERT OR IGNORE INTO linked_documents(id,source_id,document_key,first_seen_at) VALUES (?,?,?,?)')
    .run(linkedId,source.id,doc.key,retrievedAt);
  const hash=sha(bytes),versionId=sha(linkedId+hash).slice(0,32);
  db.prepare(`INSERT OR IGNORE INTO document_versions(id,linked_document_id,original_bytes,sha256,
    extracted_text,content_type,extraction_method,extraction_uncertain,recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(versionId,linkedId,bytes,hash,doc.text,doc.contentType,
      doc.contentType==='application/pdf'?'synthetic-captured-text-sidecar':'fixture-utf8',doc.extractionUncertain?1:0,retrievedAt);
  const normalized=normalize(doc.text);
  db.prepare(`INSERT OR IGNORE INTO normalization_runs(id,document_version_id,normalizer_version,normalized_text,normalized_hash)
    VALUES (?,?,?,?,?)`).run(sha(versionId+NORMALIZER_VERSION).slice(0,32),versionId,NORMALIZER_VERSION,normalized,sha(normalized));
  return {linkedId,versionId,hash,sourcePath:link.pathname,depth:doc.depth};
}
function docsForSnapshot(db,snapshotId){
  return db.prepare(`SELECT d.id,d.linked_document_id,d.sha256,d.extracted_text,d.extraction_uncertain,
    x.source_path,x.depth FROM snapshot_documents x JOIN document_versions d ON x.document_version_id=d.id
    WHERE x.snapshot_id=?`).all(snapshotId);
}
function writeCandidate(db,source,snap,linkedId,previous,current,kind){
  const beforeSha=previous?.sha256||'ABSENT',afterSha=current?.sha256||'ABSENT';
  if(beforeSha===afterSha)return;
  const before=previous?.extracted_text||'',after=current?.extracted_text||'';
  let hunks=diffText(before,after);
  if(!hunks.length && previous?.source_path!==current?.source_path)return;
  const editorial=hunks.length>0&&hunks.every(x=>x.kind==='editorial');
  const changeKind=kind|| (editorial?'editorial':'modified');
  const pathValue=current?.source_path||previous?.source_path||'(unknown attachment)';
  const summary=changeKind==='disappeared'?'Attachment absent from newer snapshot — not evidence of withdrawal':
    changeKind==='appeared'?'Attachment discovered or restored':
    editorial?'Boilerplate or navigation changed; substantive text stable':
    'Text changed — reviewer must assess operational significance';
  if(!hunks.length)hunks=[{kind:'editorial',before,after,section:'Original source bytes'}];
  const date=candidateDate(after);
  const id=sha([source.id,linkedId,beforeSha,afterSha,NORMALIZER_VERSION].join('|')).slice(0,32);
  const suggestion=changeKind==='disappeared'?'needs_domain_review':editorial?'editorial':'needs_domain_review';
  const inserted=db.prepare(`INSERT OR IGNORE INTO change_candidates(id,org_id,source_id,snapshot_id,linked_document_id,
    before_version_id,after_version_id,before_sha,after_sha,source_path,change_kind,summary,detected_at,
    published_date,effective_date_candidate,date_uncertainty,normalization_version,machine_suggestion)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id,ORG,source.id,snap.id,linkedId,previous?.id||null,current?.id||null,beforeSha,afterSha,
    pathValue,changeKind,summary,snap.retrieved_at,snap.published_date,date.value,date.note,NORMALIZER_VERSION,suggestion);
  if(inserted.changes){
    for(const [n,hunk] of hunks.entries())db.prepare(`INSERT INTO diff_hunks(id,candidate_id,ordinal,kind,section,before_text,after_text)
      VALUES (?,?,?,?,?,?,?)`).run(sha(id+':'+n).slice(0,32),id,n,hunk.kind,hunk.section,hunk.before,hunk.after);
    audit(db,'candidate',id,'detected','fixture-replay',{changeKind,sourcePath:pathValue,uncertainOCR:!!(current?.extraction_uncertain||previous?.extraction_uncertain)});
  }
}
export function replayOne(db,sourceId,increment=true) {
  const source=db.prepare('SELECT * FROM sources WHERE id=? AND org_id=?').get(sourceId,ORG);
  if(!source)throw Error('Unknown demo source');
  const fixture=FIXTURES.sources.find(s=>s.id===sourceId);
  const cursor=Math.min(source.replay_cursor,fixture.versions.length-1);
  const entry=fixture.versions[cursor];
  const fixtureVersion=cursor+1;
  const recorded=source.replay_cursor>=fixture.versions.length;
  const details=[];
  const attempts=db.prepare('INSERT INTO fetch_attempts(id,source_id,fixture_version,attempted_at,status,reason,scope_decisions) VALUES (?,?,?,?,?,?,?)');
  db.exec('BEGIN IMMEDIATE');
  try {
    if(entry.error){
      attempts.run(uid(),sourceId,fixtureVersion,entry.retrievedAt,'failure',entry.error,JSON.stringify({adapter:'fixture',network:false,reason:'upstream_timeout'}));
      db.prepare(`UPDATE sources SET replay_cursor=?,last_attempt_at=?,latest_status='failure',latest_error=? WHERE id=?`)
        .run(increment?Math.min(fixture.versions.length,source.replay_cursor+1):source.replay_cursor,entry.retrievedAt,entry.error,sourceId);
      audit(db,'source',sourceId,'coverage_failed','fixture-replay',{reason:'timeout',fixtureVersion});
      db.exec('COMMIT');return {sourceId,status:'failure',error:entry.error,version:fixtureVersion};
    }
    const snapId=sha(sourceId+':'+fixtureVersion).slice(0,32);
    const prev=db.prepare('SELECT id FROM snapshots WHERE source_id=? AND fixture_version < ? ORDER BY fixture_version DESC LIMIT 1').get(sourceId,fixtureVersion);
    const existed=!!db.prepare('SELECT id FROM snapshots WHERE id=?').get(snapId);
    const skippedLinkedIds=new Set();
    const skippedPaths=[];
    const acceptedTypes=JSON.parse(source.document_types);
    db.prepare(`INSERT OR IGNORE INTO snapshots(id,source_id,fixture_version,homepage_original,homepage_sha,retrieved_at,published_date)
      VALUES (?,?,?,?,?,?,?)`).run(snapId,sourceId,fixtureVersion,Buffer.from(entry.homepage,'utf8'),sha(entry.homepage),entry.retrievedAt,entry.publishedDate||null);
    for(const doc of entry.documents){
      if(doc.depth>source.attachment_depth||!acceptedTypes.includes(doc.contentType)){
        skippedLinkedIds.add(sha(sourceId+':'+doc.key).slice(0,32));
        skippedPaths.push(doc.path);
        continue;
      }
      const d=saveDoc(db,{id:sourceId,canonicalUrl:source.canonical_url,allowedHost:source.allowed_host,
        attachmentDepth:source.attachment_depth,documentTypes:JSON.parse(source.document_types)},doc,entry.retrievedAt);
      db.prepare(`INSERT OR IGNORE INTO snapshot_documents(snapshot_id,document_version_id,source_path,depth)
        VALUES (?,?,?,?)`).run(snapId,d.versionId,d.sourcePath,d.depth);
      details.push(d.sourcePath);
    }
    const scopeError=skippedPaths.length?`Policy scope excluded ${skippedPaths.length} link(s); coverage incomplete.`:null;
    attempts.run(uid(),sourceId,fixtureVersion,entry.retrievedAt,scopeError?'failure':'success',scopeError,
      JSON.stringify({adapter:'fixture',network:false,maxDepth:source.attachment_depth,maxBytes:2000000,allowedHost:source.allowed_host,skippedPaths}));
    if(!existed && prev){
      const previous=docsForSnapshot(db,prev.id),current=docsForSnapshot(db,snapId);
      const oldMap=new Map(previous.map(d=>[d.linked_document_id,d]));
      const newMap=new Map(current.map(d=>[d.linked_document_id,d]));
      for(const key of new Set([...oldMap.keys(),...newMap.keys()])) {
        const before=oldMap.get(key),after=newMap.get(key);
        if(before && !after && skippedLinkedIds.has(key))continue; // Outside scope is not disappearance.
        if(before && !after)writeCandidate(db,source,{id:snapId,retrieved_at:entry.retrievedAt,published_date:entry.publishedDate},key,before,null,'disappeared');
        else if(!before && after)writeCandidate(db,source,{id:snapId,retrieved_at:entry.retrievedAt,published_date:entry.publishedDate},key,null,after,'appeared');
        else if(before?.sha256!==after?.sha256)writeCandidate(db,source,{id:snapId,retrieved_at:entry.retrievedAt,published_date:entry.publishedDate},key,before,after,null);
        else if(before?.source_path!==after?.source_path) audit(db,'linked_document',key,'source_path_changed','fixture-replay',{from:before.source_path,to:after.source_path,contentUnchanged:true});
      }
    }
    const nextCursor=increment?Math.min(fixture.versions.length,source.replay_cursor+1):source.replay_cursor;
    if(scopeError){
      db.prepare(`UPDATE sources SET replay_cursor=?,last_attempt_at=?,latest_status='failure',latest_error=? WHERE id=?`)
        .run(nextCursor,entry.retrievedAt,scopeError,sourceId);
      audit(db,'source',sourceId,'coverage_failed','fixture-replay',{reason:'scope_excluded',count:skippedPaths.length});
    }else{
      db.prepare(`UPDATE sources SET replay_cursor=?,last_attempt_at=?,last_success_at=?,latest_status='success',latest_error=NULL WHERE id=?`)
        .run(nextCursor,entry.retrievedAt,entry.retrievedAt,sourceId);
    }
    db.exec('COMMIT');return {sourceId,status:scopeError?'failure':recorded?'unchanged':'success',version:fixtureVersion,paths:details,error:scopeError};
  } catch(e){db.exec('ROLLBACK');throw e;}
}
export function replayAll(db){
  let result=[];
  for(const fixture of FIXTURES.sources){
    const row=db.prepare('SELECT replay_cursor FROM sources WHERE id=?').get(fixture.id);
    const remaining=Math.max(0,fixture.versions.length-row.replay_cursor);
    for(let idx=0;idx<remaining;idx++)result.push(replayOne(db,fixture.id));
  }
  return result;
}
export function resetDemo(db){
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const t of ['audit_events','digest_drafts','action_items','review_dispositions','diff_hunks','change_candidates',
      'normalization_runs','snapshot_documents','document_versions','linked_documents','snapshots','fetch_attempts','source_policy_versions','sources'])db.exec(`DELETE FROM ${t}`);
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  seedSources(db);return replayAll(db);
}
export function initDemo(db){seedSources(db);return replayAll(db);}

export function getOverview(db){
  const sources=db.prepare('SELECT * FROM sources WHERE org_id=? ORDER BY name').all(ORG).map(s=>({...configRow(s),id:s.id,replayCursor:s.replay_cursor,
    lastAttemptAt:s.last_attempt_at,lastSuccessAt:s.last_success_at,status:s.latest_status,error:s.latest_error,
    versionsCount:FIXTURES.sources.find(f=>f.id===s.id).versions.length}));
  const candidates=db.prepare(`SELECT c.*,s.name AS source_name,s.program_labels,s.owner AS source_owner,
    (SELECT r.classification FROM review_dispositions r WHERE r.candidate_id=c.id ORDER BY r.reviewed_at DESC,r.rowid DESC LIMIT 1) AS classification,
    (SELECT r.confirmed_effective_date FROM review_dispositions r WHERE r.candidate_id=c.id ORDER BY r.reviewed_at DESC,r.rowid DESC LIMIT 1) AS confirmed_effective_date,
    (SELECT a.status FROM action_items a WHERE a.candidate_id=c.id) AS action_status
    FROM change_candidates c JOIN sources s ON c.source_id=s.id WHERE c.org_id=? ORDER BY c.detected_at DESC,c.id`).all(ORG).map(c=>({...c,program_labels:JSON.parse(c.program_labels)}));
  const actions=db.prepare(`SELECT a.*,c.summary,c.source_path,c.change_kind,s.name AS source_name
    FROM action_items a JOIN change_candidates c ON a.candidate_id=c.id JOIN sources s ON s.id=c.source_id
    WHERE a.org_id=? ORDER BY CASE a.status WHEN 'resolved' THEN 1 ELSE 0 END,a.due_date`).all(ORG);
  const attempts=db.prepare(`SELECT a.*,s.name AS source_name FROM fetch_attempts a JOIN sources s ON a.source_id=s.id
    ORDER BY attempted_at DESC,a.rowid DESC LIMIT 100`).all().map(a=>({...a,scope_decisions:JSON.parse(a.scope_decisions)}));
  const recentAudits=db.prepare('SELECT object_type,object_id,event,actor,created_at,metadata FROM audit_events WHERE org_id=? ORDER BY rowid DESC LIMIT 60').all(ORG).map(a=>({...a,metadata:JSON.parse(a.metadata)}));
  const latestDigest=db.prepare('SELECT id,body,created_at FROM digest_drafts WHERE org_id=? ORDER BY rowid DESC LIMIT 1').get(ORG)||null;
  return {organization:'Harbor Policy Operations',demo:true,offline:true,latestDigest,normalizerVersion:NORMALIZER_VERSION,
    sources,candidates,actions,attempts,audit:recentAudits,
    stats:{sources:sources.length,unreviewed:candidates.filter(c=>!c.classification).length,
      unresolvedActions:actions.filter(a=>a.status!=='resolved').length,
      coverageFailures:sources.filter(s=>s.status==='failure').length}};
}
export function candidateDetails(db,id){
  const c=db.prepare('SELECT * FROM change_candidates WHERE id=? AND org_id=?').get(id,ORG);
  if(!c)return null;
  const hunks=db.prepare('SELECT kind,section,before_text,after_text FROM diff_hunks WHERE candidate_id=? ORDER BY ordinal').all(id);
  const reviews=db.prepare('SELECT classification,reviewer,note,confirmed_effective_date,reviewed_at FROM review_dispositions WHERE candidate_id=? ORDER BY rowid DESC').all(id);
  const action=db.prepare('SELECT * FROM action_items WHERE candidate_id=? AND org_id=?').get(id,ORG);
  const uncertainty=db.prepare(`SELECT extraction_uncertain,extraction_method,sha256 FROM document_versions WHERE id=?`).get(c.after_version_id||c.before_version_id);
  return {...c,hunks,reviews,action:action||null,document:uncertainty||null,evidenceIntegrity:evidencePacket(db,id).integrity};
}
export function reviewCandidate(db,id,data){
  const valid=['editorial','relevant','urgent','needs_domain_review','dismissed'];
  if(!valid.includes(data.classification))throw Error('Invalid review classification');
  if(typeof data.reviewer!=='string'||!data.reviewer.trim()||data.reviewer.length>100)throw Error('Reviewer required');
  if(typeof data.note!=='string'||data.note.length>1000)throw Error('Review note required (max 1000 characters)');
  if(data.confirmedEffectiveDate)dateValid(data.confirmedEffectiveDate);
  const c=db.prepare('SELECT id FROM change_candidates WHERE id=? AND org_id=?').get(id,ORG);
  if(!c)throw Error('Candidate not found');
  const active=db.prepare('SELECT id FROM action_items WHERE candidate_id=?').get(id);
  if(active&&!['relevant','urgent'].includes(data.classification))throw Error('Cannot declassify a candidate with an existing action');
  const idReview=uid(),reviewedAt=now();
  db.prepare(`INSERT INTO review_dispositions(id,candidate_id,classification,reviewer,note,confirmed_effective_date,reviewed_at)
    VALUES (?,?,?,?,?,?,?)`).run(idReview,id,data.classification,data.reviewer.trim(),data.note,data.confirmedEffectiveDate||null,reviewedAt);
  audit(db,'candidate',id,'reviewed',data.reviewer.trim(),{classification:data.classification,hasConfirmedDate:!!data.confirmedEffectiveDate});
  return {id:idReview,reviewedAt};
}
function dateValid(date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Due date must be a real YYYY-MM-DD date');}
export function createAction(db,candidateId,data){
  const details=candidateDetails(db,candidateId);
  if(!details)throw Error('Candidate not found');
  if(!details.reviews.length||!['relevant','urgent'].includes(details.reviews[0].classification))throw Error('Relevant or urgent human review is required before action assignment');
  if(details.action)throw Error('Action already exists for this change');
  if(typeof data.owner!=='string'||!data.owner.trim()||data.owner.length>100)throw Error('Action owner required');
  if(data.note!==undefined&&(typeof data.note!=='string'||data.note.length>2000))throw Error('Assignment note must be text, max 2000 characters');
  dateValid(data.dueDate);
  const id=uid(),time=now();
  db.prepare(`INSERT INTO action_items(id,org_id,candidate_id,owner,due_date,status,note,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id,ORG,candidateId,data.owner.trim(),data.dueDate,'assigned',data.note||'',time,time);
  audit(db,'action',id,'assigned',data.owner.trim(),{dueDate:data.dueDate,candidateId});
  return {id};
}
export function updateAction(db,id,data){
  const row=db.prepare('SELECT * FROM action_items WHERE id=? AND org_id=?').get(id,ORG);
  if(!row)throw Error('Action not found');
  if(!['assigned','acknowledged','resolved'].includes(data.status))throw Error('Invalid status');
  if(row.status==='resolved')throw Error('Resolved actions are immutable in demo mode');
  if(row.status==='assigned'&&data.status==='resolved')throw Error('Acknowledge action before resolving');
  if(typeof data.owner!=='string'||!data.owner.trim()||data.owner.length>100)throw Error('Action owner required');
  dateValid(data.dueDate);
  if(typeof data.note!=='string'||data.note.length>2000)throw Error('Note must be text, max 2000 characters');
  if(data.status==='resolved'&&!data.note.trim())throw Error('Resolution note required');
  if(row.owner===data.owner.trim()&&row.due_date===data.dueDate&&row.status===data.status&&row.note===data.note)
    return {id,updatedAt:row.updated_at,unchanged:true};
  const changedAt=now();
  db.prepare('UPDATE action_items SET owner=?,due_date=?,status=?,note=?,updated_at=? WHERE id=? AND org_id=?')
    .run(data.owner.trim(),data.dueDate,data.status,data.note,changedAt,id,ORG);
  audit(db,'action',id,data.status, data.owner.trim(),{dueDate:data.dueDate,status:data.status,hasNote:!!data.note});
  return {id,updatedAt:changedAt};
}
export function updateSource(db,id,data){
  const old=db.prepare('SELECT * FROM sources WHERE id=? AND org_id=?').get(id,ORG);
  if(!old)throw Error('Source not found');
  const allowed=['owner','timezone','cadenceMinutes','attachmentDepth','programLabels'];
  if(Object.keys(data).some(k=>!allowed.includes(k)))throw Error('Demo cannot change approved host, protocol or source identity');
  const owner=data.owner===undefined?old.owner:data.owner;
  const timezone=data.timezone===undefined?old.timezone:data.timezone;
  const cadence=data.cadenceMinutes===undefined?old.cadence_minutes:data.cadenceMinutes;
  const depth=data.attachmentDepth===undefined?old.attachment_depth:data.attachmentDepth;
  const labels=data.programLabels===undefined?JSON.parse(old.program_labels):data.programLabels;
  if(typeof owner!=='string'||!owner.trim()||owner.length>100)throw Error('Invalid owner');
  if(typeof timezone!=='string'||!['America/New_York','UTC','America/Chicago','America/Los_Angeles'].includes(timezone))throw Error('Unsupported timezone');
  if(!Number.isInteger(cadence)||cadence<15||cadence>10080)throw Error('Cadence out of bounds');
  if(!Number.isInteger(depth)||depth<0||depth>3)throw Error('Attachment depth out of bounds');
  if(!Array.isArray(labels)||labels.length<1||labels.length>10||labels.some(l=>typeof l!=='string'||l.length>60||!l.trim()))throw Error('Invalid program labels');
  db.prepare('UPDATE sources SET owner=?,timezone=?,cadence_minutes=?,attachment_depth=?,program_labels=? WHERE id=? AND org_id=?')
    .run(owner.trim(),timezone,cadence,depth,JSON.stringify(labels),id,ORG);
  const updated=db.prepare('SELECT * FROM sources WHERE id=?').get(id);
  db.prepare('INSERT INTO source_policy_versions(id,source_id,config,created_at,created_by) VALUES (?,?,?,?,?)')
    .run(uid(),id,JSON.stringify(configRow(updated)),now(),'demo-operator');
  audit(db,'source',id,'configuration_changed','demo-operator',{fields:Object.keys(data)});
  return configRow(updated);
}
export function makeDigest(db) {
  const snapshot=getOverview(db);
  const lines=[`HARBOR POLICY OPERATIONS — LOCAL DRAFT DIGEST`,`Demo data only • Generated ${now()}`,''];
  for(const c of snapshot.candidates.filter(c=>c.classification&&c.classification!=='dismissed')){
    lines.push(`• ${c.source_name}: ${c.summary}`);
    lines.push(`  ${c.source_path} • ${c.classification} • detected ${c.detected_at}`);
    const action=snapshot.actions.find(a=>a.candidate_id===c.id);
    if(action)lines.push(`  Action: ${action.owner}; due ${action.due_date}; ${action.status}`);
  }
  lines.push('',`Coverage failures: ${snapshot.stats.coverageFailures}. These do not mean no changes.`,
    'Draft only. Human-reviewed classifications are not legal interpretations. No external message sent.');
  const body=lines.join('\n'),id=uid(),time=now();
  db.prepare('INSERT INTO digest_drafts(id,org_id,body,created_at,updated_at) VALUES (?,?,?,?,?)').run(id,ORG,body,time,time);
  audit(db,'digest',id,'drafted','demo-operator',{externalSend:false});
  return {id,body};
}
export function searchArchive(db,q){
  const term=String(q||'').toLowerCase().trim().slice(0,200);
  const candidates=getOverview(db).candidates;
  return candidates.filter(c=>!term||[c.source_name,c.source_path,c.summary,c.change_kind,...c.program_labels].join(' ').toLowerCase().includes(term)).map(c=>({
    ...c,hunks:db.prepare('SELECT kind,section,before_text,after_text FROM diff_hunks WHERE candidate_id=? ORDER BY ordinal').all(c.id)
  }));
}

/** Offline evidence receipt. Hashes attest local consistency, not third-party provenance or approval. */
export function evidencePacket(db,id){
  const c=db.prepare(`SELECT c.*,s.name AS source_name,s.canonical_url,s.allowed_host,s.program_labels
    FROM change_candidates c JOIN sources s ON s.id=c.source_id
    WHERE c.id=? AND c.org_id=? AND s.org_id=?`).get(id,ORG,ORG);
  if(!c)return null;
  const hunks=db.prepare(`SELECT ordinal,kind,section,before_text,after_text FROM diff_hunks
    WHERE candidate_id=? ORDER BY ordinal`).all(id);
  const failures=[];
  const readVersion=(versionId,expectedHash,side)=>{
    if(!versionId){
      if(expectedHash!=='ABSENT')failures.push(`${side}: absent version has a non-ABSENT hash`);
      return null;
    }
    const v=db.prepare(`SELECT d.id,d.sha256,d.original_bytes,d.extracted_text,d.content_type,
      d.extraction_method,d.extraction_uncertain,n.normalizer_version,n.normalized_text,n.normalized_hash
      FROM document_versions d LEFT JOIN normalization_runs n
      ON n.document_version_id=d.id AND n.normalizer_version=? WHERE d.id=?`).get(c.normalization_version,versionId);
    if(!v){failures.push(`${side}: referenced document version missing`);return null;}
    if(v.sha256!==expectedHash)failures.push(`${side}: candidate hash disagrees with document record`);
    if(sha(v.original_bytes)!==v.sha256)failures.push(`${side}: original bytes do not match recorded SHA-256`);
    const normalized=normalize(v.extracted_text);
    if(v.normalizer_version!==c.normalization_version)failures.push(`${side}: required normalizer run missing`);
    if(v.normalized_text!==normalized||v.normalized_hash!==sha(normalized))failures.push(`${side}: normalized evidence mismatch`);
    return {id:v.id,originalSha256:v.sha256,contentType:v.content_type,
      extractionMethod:v.extraction_method,extractionUncertain:!!v.extraction_uncertain,
      normalizedSha256:v.normalized_hash,extractedText:v.extracted_text};
  };
  const before=readVersion(c.before_version_id,c.before_sha,'before');
  const after=readVersion(c.after_version_id,c.after_sha,'after');
  const recomputed=diffText(before?.extractedText||'',after?.extractedText||'');
  if(recomputed.length && !recomputed.every((h,i)=>{
    const stored=hunks[i];
    return stored&&stored.kind===h.kind&&stored.section===h.section&&stored.before_text===h.before&&stored.after_text===h.after;
  }) || (recomputed.length>0&&recomputed.length!==hunks.length)) failures.push('stored diff hunks disagree with current normalizer');
  // Byte-only changes may use an explicit editorial hunk even when extracted text is equal.
  if(!recomputed.length&&hunks.some(h=>h.kind!=='editorial'))failures.push('non-editorial hunk without a textual change');
  const immutable={schema:'harbor-evidence-v1',candidateId:c.id,sourceId:c.source_id,
    canonicalUrl:c.canonical_url,sourcePath:c.source_path,changeKind:c.change_kind,
    detectedAt:c.detected_at,publishedDate:c.published_date,effectiveDateCandidate:c.effective_date_candidate,
    normalizerVersion:c.normalization_version,beforeSha256:c.before_sha,afterSha256:c.after_sha,
    hunks:hunks.map(h=>({ordinal:h.ordinal,kind:h.kind,section:h.section,before:h.before_text,after:h.after_text}))};
  const reviews=db.prepare('SELECT classification,reviewer,note,confirmed_effective_date,reviewed_at FROM review_dispositions WHERE candidate_id=? ORDER BY rowid').all(id);
  const action=db.prepare('SELECT owner,due_date,status,note,created_at,updated_at FROM action_items WHERE candidate_id=? AND org_id=?').get(id,ORG)||null;
  const events=db.prepare(`SELECT object_type,object_id,event,actor,metadata,created_at FROM audit_events
    WHERE org_id=? AND ((object_type='candidate' AND object_id=?) OR (object_type='action' AND object_id=?))
    ORDER BY rowid`).all(ORG,id,db.prepare('SELECT id FROM action_items WHERE candidate_id=?').get(id)?.id||'');
  return {receiptSha256:sha(JSON.stringify(immutable)),immutable,
    sourceName:c.source_name,programLabels:JSON.parse(c.program_labels),
    documents:{before:before&&{...before,extractedText:undefined},after:after&&{...after,extractedText:undefined}},
    integrity:{state:failures.length?'failed':'verified',checks:['original-byte-sha256','candidate-sha256','normalizer-run','stored-diff'],failures,
      caveat:'Local consistency only; this is not a digital signature, proof of official publication, or legal approval.'},
    reviewHistory:reviews,action,auditTrail:events.map(e=>({...e,metadata:JSON.parse(e.metadata)})),exportScope:'Synthetic offline demo; no live data fetched.'};
}