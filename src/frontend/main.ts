// @ts-nocheck
/** No frameworks, client-side persistence, or external integrations. Server owns authoritative state. */
const $=(selector:string)=>document.querySelector(selector) as HTMLElement;
const escapeHtml=(value:any)=>String(value??'').replace(/[&<>"']/g,(s)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const dateOnly=(str:any)=>str?String(str).slice(0,10):'—';
const nice=(v:any)=>String(v||'').replace(/_/g,' ');
const short=(str:any,n=125)=>String(str||'').length>n?String(str).slice(0,n-1)+'…':String(str||'');
const sections=['review','sources','actions','archive','digest'];
const labels={review:'Review queue',sources:'Source coverage',actions:'Action queue',archive:'Evidence archive',digest:'Local digest'};
const desc={review:'Assess verified text differences before any work is assigned.',sources:'Inspect scope, polling history, and coverage health.',actions:'Track confirmed work to acknowledgment and resolution.',archive:'Search preserved before/after source evidence.',digest:'Preview a human-readable draft. Nothing will be sent.'};
let appData:any=null,selected:string|null=null,view='review',detail:any=null,banner='',bannerBad=false,archiveQuery='',digest='',busy=false;

async function api(url:string,method='GET',payload?:any){
  const response=await fetch(url,{method,headers:method==='POST'?{'Content-Type':'application/json'}:{},body:method==='POST'?JSON.stringify(payload||{}):undefined,credentials:'same-origin'});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||`Request failed (${response.status})`);
  return data;
}
function statusTag(status:any){return `<span class="pill ${status==='failure'?'pill-danger':status==='resolved'?'pill-good':status==='success'?'pill-good':'pill-neutral'}">${escapeHtml(nice(status))}</span>`}
function info(label:string,value:any){return `<div class="info"><div class="meta">${label}</div><div class="info-value">${escapeHtml(value||'—')}</div></div>`}
function bodyShell(content:string){
  const data=appData;
  const navigation=sections.map((v)=>`<button class="nav-link ${view===v?'active':''}" type="button" data-view="${v}" aria-current="${view===v?'page':'false'}"><span class="nav-icon">${({review:'◫',sources:'◎',actions:'☑',archive:'▤',digest:'▧'} as any)[v]}</span>${labels[v]}${v==='review'?`<span class="nav-count">${data?.stats.unreviewed??0}</span>`:''}</button>`).join('');
  return `<div class="shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">H</div><div><strong>Harbor</strong><span>POLICY OPERATIONS</span></div></div><div class="workspace-tag"><span class="status-dot"></span> Demonstration workspace</div><nav aria-label="Primary">${navigation}</nav><div class="sidebar-bottom"><div class="small-head">SOURCE CONNECTION</div><div class="sidebar-status"><span class="round-icon">⌁</span><div><b>Offline fixtures</b><small>No external monitoring</small></div></div><p class="sidebar-caption">Synthetic policy information. Human confirmation required for every action.</p></div></aside>
  <main class="workspace"><header class="topbar"><div class="eyebrow">OPERATIONS / ${labels[view].toUpperCase()}</div><div class="topbar-actions"><span class="offline-marker"><span class="status-dot"></span> OFFLINE DEMO</span><span class="avatar" aria-label="Demo operator">HO</span></div></header><div class="main-content"><div class="page-heading"><div><h1>${labels[view]}</h1><p>${desc[view]}</p></div><button type="button" class="reset-link" data-action="reset" title="Delete and recreate only synthetic demo records">↻ Reset demo data</button></div>
  ${banner?`<div role="status" class="notice ${bannerBad?'notice-error':''}">${escapeHtml(banner)}<button type="button" aria-label="Dismiss notice" data-action="dismiss">×</button></div>`:''}
  ${content}</div></main></div>`;
}
function summary(){
  const stats=appData.stats;
  return `<div class="stat-grid"><div class="stat"><span>Sources monitored</span><strong>${stats.sources}</strong><small>Approved synthetic captures</small></div>
  <div class="stat"><span>Awaiting human review</span><strong>${stats.unreviewed}</strong><small>Textual candidates, not decisions</small></div>
  <div class="stat"><span>Open action items</span><strong>${stats.unresolvedActions}</strong><small>Assigned and acknowledged</small></div>
  <div class="stat ${stats.coverageFailures?'stat-warning':''}"><span>Coverage gaps</span><strong>${stats.coverageFailures}</strong><small>${stats.coverageFailures?'Retrieval failures need attention':'All latest attempts succeeded'}</small></div></div>`;
}
function candidateLabel(c:any){return c.change_kind==='disappeared'?'Missing attachment':c.change_kind==='editorial'?'Boilerplate-only':'Document change'}
function candidateRow(c:any){return `<button class="candidate-row ${selected===c.id?'selected':''}" type="button" data-candidate="${c.id}"><div class="candidate-title">${escapeHtml(c.source_name)} <span class="list-time">${dateOnly(c.detected_at)}</span></div><div class="candidate-path">${escapeHtml(c.source_path)}</div><p>${escapeHtml(short(c.summary,100))}</p><div class="row-bottom"><span class="pill pill-outline">${escapeHtml(candidateLabel(c))}</span>${c.classification?statusTag(c.classification):'<span class="pill pill-attention">Needs review</span>'}</div></button>`}
function detailPane(){
  if(!selected)return `<div class="empty-state"><div class="empty-icon">▤</div><h2>Select a detected change</h2><p>Choose a candidate to inspect before/after evidence, source context and its review history.</p></div>`;
  if(!detail)return `<div class="empty-state">Loading evidence…</div>`;
  const c=detail;
  const overview=appData.candidates.find(x=>x.id===selected);
  const label=overview?.source_name||c.source_id;
  const evidence=c.hunks.map((h:any,i:number)=>`<div class="evidence-block"><div class="evidence-head">${escapeHtml(h.section)} <span class="pill pill-outline">${escapeHtml(h.kind)}</span></div><div class="compare-grid"><div><div class="compare-label">BEFORE — ORIGINAL EXCERPT</div><pre class="before">${escapeHtml(h.before_text||'(not present)')}</pre></div><div><div class="compare-label">AFTER — ORIGINAL EXCERPT</div><pre class="after">${escapeHtml(h.after_text||'(not present)')}</pre></div></div></div>`).join('');
  const reviews=c.reviews.map((r:any)=>`<div class="history-entry"><b>${escapeHtml(nice(r.classification))}</b><span>${escapeHtml(r.reviewer)} · ${escapeHtml(dateOnly(r.reviewed_at))}</span><p>${escapeHtml(r.note||'No note')}</p>${r.confirmed_effective_date?`<small>Confirmed effective date: ${escapeHtml(r.confirmed_effective_date)}</small>`:''}</div>`).join('');
  const canAct=c.reviews[0]&&['relevant','urgent'].includes(c.reviews[0].classification)&&!c.action;
  const actionForm=canAct?`<form class="form-grid" data-form="create-action" data-id="${c.id}"><div class="form-field"><label for="new-owner">Action owner</label><input id="new-owner" name="owner" required value="${escapeHtml(overview?.source_owner)}"/></div><div class="form-field"><label for="new-due">Due date (local calendar day)</label><input id="new-due" name="dueDate" type="date" required/></div><div class="form-field wide"><label for="new-note">Assignment note (optional)</label><input id="new-note" name="note" placeholder="Describe the needed operational check"/></div><button class="btn primary" type="submit">Create human-approved action</button></form>`:'';
  return `<div class="detail"><div class="detail-heading"><span class="overline">CHANGE EVIDENCE</span><h2>${escapeHtml(label)}</h2><div class="detail-subtitle">${escapeHtml(c.source_path)}</div><div class="detail-tags">${statusTag(c.change_kind)} ${c.reviews.length?statusTag(c.reviews[0].classification):statusTag('unreviewed')}</div></div>
  <div class="integrity-callout ${c.evidenceIntegrity?.state==='verified'?'integrity-good':'integrity-alert'}" role="status"><strong>${c.evidenceIntegrity?.state==='verified'?'✓ Local evidence consistent':'⚠ Evidence integrity requires investigation'}</strong><span>${c.evidenceIntegrity?.state==='verified'?'Original hashes, normalization and retained diff were checked; this is not independent attestation.':escapeHtml(c.evidenceIntegrity?.failures?.join('; ')||'Could not verify evidence.')}</span></div>
  ${c.change_kind==='disappeared'?'<div class="caution">Attachment not found in this capture. This does not establish policy withdrawal.</div>':''}
  ${c.document?.extraction_uncertain?'<div class="caution">OCR / transcription uncertain. Compare against the original scan before confirming.</div>':''}
  <div class="details-grid">${info('Detected / retrieved',c.detected_at.replace('T',' ').slice(0,16)+' UTC')}${info('Source publication date',c.published_date||'Not supplied')}${info('Effective date candidate',c.effective_date_candidate||'Unconfirmed / missing')}${info('Normalizer',c.normalization_version)}</div>
  <div class="subtle-line">${escapeHtml(c.date_uncertainty||'')}</div><h3 class="section-heading">Preserved passages</h3>${evidence}
  <p class="tip">Machine suggestion: <b>${escapeHtml(nice(c.machine_suggestion))}</b>. This is not a human disposition. Source text is untrusted and cannot trigger actions or instructions.</p>
  <div class="evidence-export"><a class="btn secondary" href="/api/candidates/${c.id}/evidence.json" download>Export evidence receipt (.json)</a><small>SHA-256 and local integrity checks; not a digital signature</small></div>
  ${c.before_version_id?`<a class="plain-link" href="/api/documents/${c.before_version_id}/original">Download previous original</a>`:''} ${c.after_version_id?`<a class="plain-link" style="margin-left:14px" href="/api/documents/${c.after_version_id}/original">Download current original</a>`:''}
  <div class="divider"></div><h3 class="section-heading">Human disposition</h3>
  <form class="form-grid" data-form="review" data-id="${c.id}"><div class="form-field"><label for="review-class">Classification</label><select id="review-class" name="classification" required><option value="">Choose classification…</option>${['editorial','relevant','urgent','needs_domain_review','dismissed'].map(x=>`<option value="${x}" ${c.reviews[0]?.classification===x?'selected':''}>${nice(x)}</option>`).join('')}</select></div>
  <div class="form-field"><label for="review-date">Confirmed effective date, if verified</label><input id="review-date" type="date" name="confirmedEffectiveDate" value="${escapeHtml(c.reviews[0]?.confirmed_effective_date||'')}"/></div>
  <div class="form-field"><label for="reviewer">Reviewer</label><input id="reviewer" name="reviewer" maxlength="100" required placeholder="Name or review role" value="Demo reviewer"/></div>
  <div class="form-field wide"><label for="review-note">Reason / assessment</label><textarea id="review-note" name="note" rows="2" maxlength="1000" placeholder="Evidence checked, uncertainty remaining"></textarea></div><button class="btn primary" type="submit">Record review decision</button></form>
  ${canAct?`<div class="divider"></div><h3 class="section-heading">Assign operational follow-up</h3>${actionForm}`:''}
  ${c.action?`<div class="inline-confirm">Action ${escapeHtml(c.action.status)} — open the Action queue to edit or resolve.</div>`:''}
  ${reviews?`<div class="divider"></div><h3 class="section-heading">Review history</h3>${reviews}`:''}</div>`;
}
function renderReview(){return `${summary()}<div class="grid-review"><section class="panel list-panel"><div class="panel-heading"><h2>Detected change candidates</h2><span class="muted">${appData.candidates.length} retained</span></div><div class="candidate-list">${appData.candidates.map(candidateRow).join('')||'<div class="empty-state">No candidates. Replay or reset the synthetic history.</div>'}</div></section><section class="panel detail-panel" aria-label="Selected change detail">${detailPane()}</section></div>`}
function renderSources(){
  return `${summary()}<div class="section-top"><h2>Approved capture sources</h2><button class="btn secondary" type="button" data-action="replay-all">Replay remaining history</button></div><div class="source-grid">${appData.sources.map((s:any)=>`<section class="panel source-card"><div class="source-top"><div><div class="source-name">${escapeHtml(s.name)}</div><div class="source-url">${escapeHtml(s.canonicalUrl)}</div></div>${statusTag(s.status)}</div><div class="source-attrs"><div><span>Last successful retrieval</span><b>${dateOnly(s.lastSuccessAt)}</b></div><div><span>Latest attempt</span><b>${dateOnly(s.lastAttemptAt)}</b></div><div><span>Replay position</span><b>${s.replayCursor} / ${s.versionsCount} events</b></div><div><span>Attachment limit</span><b>${s.attachmentDepth} hops, 2 MB</b></div></div>${s.error?`<div class="caution">${escapeHtml(s.error)}. Coverage incomplete; do not infer unchanged policy.</div>`:''}<div class="source-programs">${s.programLabels.map((v:string)=>`<span class="pill pill-outline">${escapeHtml(v)}</span>`).join('')}</div>
    <details class="config"><summary>Source scope & settings</summary><form data-form="source-config" data-id="${s.id}" class="form-grid compact"><div class="form-field wide"><label>Allowed host (fixed in demo)</label><input readonly value="${escapeHtml(s.allowedHost)}"/></div><div class="form-field"><label>Document types</label><input readonly value="${escapeHtml(s.documentTypes.join(', '))}"/></div><div class="form-field"><label>Owner</label><input name="owner" value="${escapeHtml(s.owner)}" required/></div><div class="form-field"><label>Cadence (minutes)</label><input name="cadenceMinutes" type="number" min="15" max="10080" value="${s.cadenceMinutes}" required/></div><div class="form-field"><label>Attachment depth</label><input name="attachmentDepth" type="number" min="0" max="3" value="${s.attachmentDepth}" required/></div><div class="form-field"><label>Timezone</label><select name="timezone">${['America/New_York','UTC','America/Chicago','America/Los_Angeles'].map(t=>`<option ${s.timezone===t?'selected':''}>${t}</option>`).join('')}</select></div><div class="form-field wide"><label>Programs (comma separated)</label><input name="programLabels" value="${escapeHtml(s.programLabels.join(', '))}" required/></div><button class="btn secondary" type="submit">Save policy version</button></form></details>
    <div class="source-footer"><span>Fixture adapter · no network calls</span><div class="button-cluster"><button class="btn ghost" type="button" data-poll="${s.id}">Check again</button><button class="btn secondary" type="button" data-replay="${s.id}" ${s.replayCursor>=s.versionsCount?'disabled':''}>Next capture</button></div></div></section>`).join('')}</div>
  <div class="panel table-panel"><div class="panel-heading"><h2>Most recent retrieval attempts</h2><span class="muted">Failures ≠ no changes</span></div><div class="table-scroll"><table><thead><tr><th>Source</th><th>Attempted at (UTC)</th><th>Fixture revision</th><th>Result</th><th>Scope / reason</th></tr></thead><tbody>${appData.attempts.slice(0,30).map((a:any)=>`<tr><td>${escapeHtml(a.source_name)}</td><td>${escapeHtml(a.attempted_at)}</td><td>${a.fixture_version}</td><td>${statusTag(a.status)}</td><td>${escapeHtml(a.reason||`Depth ≤ ${a.scope_decisions.maxDepth}; 2 MB max; approved host`)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function renderActions(){return `${summary()}<div class="section-top"><h2>Assigned follow-up</h2><span class="muted">Human-confirmed relevance is required to create an action</span></div>${appData.actions.length?`<div class="action-grid">${appData.actions.map((a:any)=>`<article class="panel action-card"><div class="action-top"><div><div class="overline">${escapeHtml(a.source_name)}</div><h2>${escapeHtml(a.source_path)}</h2><p>${escapeHtml(a.summary)}</p></div>${statusTag(a.status)}</div><form data-form="edit-action" data-id="${a.id}" class="form-grid"><div class="form-field"><label>Owner</label><input name="owner" value="${escapeHtml(a.owner)}" required/></div><div class="form-field"><label>Due date (calendar day)</label><input name="dueDate" type="date" value="${escapeHtml(a.due_date)}" required/></div><div class="form-field"><label>Status</label><select name="status" ${a.status==='resolved'?'disabled':''}>${['assigned','acknowledged','resolved'].map(status=>`<option value="${status}" ${status===a.status?'selected':''}>${nice(status)}</option>`).join('')}</select>${a.status==='resolved'?'<input type="hidden" name="status" value="resolved"/>':''}</div><div class="form-field wide"><label>Progress / resolution note</label><textarea name="note" rows="2" maxlength="2000">${escapeHtml(a.note)}</textarea></div><div class="action-footer"><small>Updated ${dateOnly(a.updated_at)}</small><button class="btn primary" ${a.status==='resolved'?'disabled':''} type="submit">Save action</button></div></form></article>`).join('')}</div>`:'<div class="panel empty-state"><div class="empty-icon">☑</div><h2>No actions assigned</h2><p>Classify a detected change as relevant or urgent, then explicitly create an action from its evidence panel.</p><button class="btn secondary" type="button" data-view="review">Go to review queue</button></div>'}`}
function renderArchive(){
 const rows=appData.candidates.filter((c:any)=>[c.source_name,c.source_path,c.summary,c.change_kind,...c.program_labels].join(' ').toLowerCase().includes(archiveQuery.toLowerCase()));
 return `<section class="panel archive-panel"><div class="search-row"><div><h2>Change evidence archive</h2><p class="muted">Source originals, comparison history, and reviewer decisions remain inspectable.</p></div><form data-form="archive-search" class="search-form"><input name="query" aria-label="Search source, path or program" placeholder="Search source, path, program…" value="${escapeHtml(archiveQuery)}"/><button class="btn secondary">Search</button></form></div><div class="table-scroll"><table><thead><tr><th>Detected (UTC)</th><th>Source</th><th>Evidence path</th><th>Kind</th><th>Disposition</th></tr></thead><tbody>${rows.map((c:any)=>`<tr><td>${dateOnly(c.detected_at)}</td><td>${escapeHtml(c.source_name)}</td><td><button class="text-button" data-candidate="${c.id}" data-switch="review">${escapeHtml(c.source_path)}</button></td><td>${escapeHtml(c.change_kind)}</td><td>${c.classification?statusTag(c.classification):'<span class="pill pill-attention">Pending</span>'}</td></tr>`).join('')||'<tr><td colspan="5">No matching evidence. Try a different search term.</td></tr>'}</tbody></table></div></section><div class="panel audit-panel"><div class="panel-heading"><h2>Audit trail</h2><span class="muted">No raw sensitive payloads in event metadata</span></div><div class="table-scroll"><table><thead><tr><th>When</th><th>Object</th><th>Event</th><th>Actor</th></tr></thead><tbody>${appData.audit.slice(0,35).map((a:any)=>`<tr><td>${escapeHtml(a.created_at.slice(0,19).replace('T',' '))}</td><td>${escapeHtml(a.object_type)}</td><td>${escapeHtml(nice(a.event))}</td><td>${escapeHtml(a.actor)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function renderDigest(){return `<div class="digest-layout"><section class="panel digest-card"><div class="overline">LOCAL OUTPUT ONLY</div><h2>Review digest</h2><p>Build an exportable text draft from the retained reviews and action records. This never sends an email or interprets legal requirements.</p><button class="btn primary" type="button" data-action="digest">Generate draft preview</button><div class="digest-disclaimer">No mailbox or Teams account connected. Drafts are stored in the local SQLite database.</div></section><section class="panel preview-card"><div class="panel-heading"><h2>Draft preview</h2><span class="muted">Plain text · editable copy</span></div>${digest?`<textarea class="digest-output" aria-label="Digest draft text" spellcheck="false">${escapeHtml(digest)}</textarea><button class="btn secondary" type="button" data-action="copy-digest">Copy draft text</button>`:'<div class="empty-state"><div class="empty-icon">▧</div><h2>No digest prepared</h2><p>Generate a preview to inspect the wording and coverage caveats before copying.</p></div>'}</section></div>`}
function render(){
 $('#app').innerHTML=bodyShell((({review:renderReview,sources:renderSources,actions:renderActions,archive:renderArchive,digest:renderDigest} as any)[view])());
}
async function refresh(){appData=await api('/api/overview');if(!digest&&appData.latestDigest)digest=appData.latestDigest.body;if(!selected&&appData.candidates.length)selected=appData.candidates[0].id;if(selected){detail=await api(`/api/candidates/${selected}`);}render();}
async function changeCandidate(id:string){selected=id;detail=null;render();detail=await api(`/api/candidates/${id}`);render();}
async function run(action:()=>Promise<any>,success:string){
  if(busy)return;busy=true;
  try{await action();banner=success;bannerBad=false;await refresh();}
  catch(error){banner=error instanceof Error?error.message:String(error);bannerBad=true;render();}
  finally{busy=false;}
}
const formData=(form:HTMLFormElement)=>Object.fromEntries(new FormData(form).entries());
document.addEventListener('click',async(event)=>{
  const target=(event.target as HTMLElement).closest('button') as HTMLButtonElement|null;
  if(!target)return;
  if(target.dataset.view){view=target.dataset.view;render();return;}
  if(target.dataset.candidate){if(target.dataset.switch)view=target.dataset.switch;await changeCandidate(target.dataset.candidate);return;}
  if(target.dataset.replay){await run(()=>api(`/api/sources/${target.dataset.replay}/replay`,'POST'), 'The next synthetic capture was processed.');return;}
  if(target.dataset.poll){await run(()=>api('/api/demo/poll','POST',{sourceId:target.dataset.poll}), 'Repeated poll recorded; duplicate changes were not created.');return;}
  if(target.dataset.action==='reset'){
    if(!confirm('Reset ONLY Harbor synthetic demo data, including all reviews and actions?'))return;
    selected=null;detail=null;digest='';await run(()=>api('/api/demo/reset','POST'),'Demo history restored. Existing synthetic reviews and actions were cleared.');return;
  }
  if(target.dataset.action==='replay-all'){await run(()=>api('/api/demo/replay-all','POST'),'Remaining fixture history replayed.');return;}
  if(target.dataset.action==='digest'){await run(async()=>{digest=(await api('/api/digest/preview','POST')).body},'Local draft generated; nothing was sent.');return;}
  if(target.dataset.action==='copy-digest'){
    try{await navigator.clipboard.writeText(($('.digest-output') as HTMLTextAreaElement).value);banner='Draft copied. No message sent.';bannerBad=false;}catch{banner='Clipboard unavailable. Select and copy the draft text manually.';bannerBad=true;}render();return;
  }
  if(target.dataset.action==='dismiss'){banner='';render();}
});
document.addEventListener('submit',async(event)=>{
  const form=event.target as HTMLFormElement;
  if(!form.dataset.form)return;
  event.preventDefault();
  const values=formData(form);
  if(form.dataset.form==='archive-search'){archiveQuery=String(values.query||'');render();return;}
  if(form.dataset.form==='review'){await run(()=>api(`/api/candidates/${form.dataset.id}/review`,'POST',{...values}),'Review disposition recorded.');return;}
  if(form.dataset.form==='create-action'){await run(()=>api(`/api/candidates/${form.dataset.id}/action`,'POST',{...values}),'Action assigned to a human owner.');return;}
  if(form.dataset.form==='edit-action'){await run(()=>api(`/api/actions/${form.dataset.id}/update`,'POST',{...values}),'Action state and date saved.');return;}
  if(form.dataset.form==='source-config'){
    const payload={owner:values.owner,timezone:values.timezone,cadenceMinutes:Number(values.cadenceMinutes),attachmentDepth:Number(values.attachmentDepth),programLabels:String(values.programLabels).split(',').map(s=>s.trim())};
    await run(()=>api(`/api/sources/${form.dataset.id}/config`,'POST',payload),'New source-policy version saved.');
  }
});
refresh().catch(error=>{$('#app').innerHTML=`<main class="fatal"><h1>Local demo unavailable</h1><p>${escapeHtml(error?.message||error)}</p><p>Refresh this page after starting the local server.</p></main>`});