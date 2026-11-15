// @ts-nocheck
/**
 * Opt-in transport for administrator-approved HTTPS sources (issue #2).
 * The server reaches it only with LIVE_FETCH=enabled. The allowlist comes from
 * the stored source policy alone. Each hop is resolved here, every DNS answer
 * is validated, and the socket is pinned to a validated address while SNI, Host
 * and certificate checks keep the approved hostname. Redirects are never
 * followed automatically. PDF and script content is never parsed or executed.
 */
import dns from 'node:dns';
import https from 'node:https';
import net from 'node:net';
import crypto from 'node:crypto';
import {approvedUrl,redirectTarget,validateResolution} from './network-policy';
import {MAX_CAPTURE_BYTES,collectBounded,validateMediaType,validateResponseHeaders} from './response-capture';

export const LIVE_TYPES=['text/html','application/pdf'];
export const HTML_METHOD='live-html-text-v1';
export const PDF_METHOD='unavailable:live-pdf-text-not-extracted';
// Tests may only tighten these; see tighten().
export const LIVE_LIMITS=Object.freeze({connectTimeoutMs:5000,requestTimeoutMs:15000,pollTimeoutMs:60000,
 maxDocuments:25,maxPollBytes:10_000_000,maxLinksPerPage:500,maxSkipEntries:300});
const REDIRECTS=new Set([301,302,303,307,308]);
const sha=(data)=>crypto.createHash('sha256').update(data).digest('hex');
const message=(e)=>String(e?.message||e).slice(0,200);
const timeoutError=()=>Object.assign(Error('Time limit exceeded'),{code:'ETIMEDOUT'});
const tighten=(o={})=>Object.fromEntries(Object.entries(LIVE_LIMITS)
 .map(([k,v])=>[k,Number.isFinite(o[k])&&o[k]>0?Math.min(v,o[k]):v]));

/** Exact approved path, or a path below an approved prefix. Encoded separators are refused. */
export function inApprovedPaths(url,prefixes){
 const p=url.pathname;
 if(/%2f|%5c/i.test(p))return false;
 return prefixes.some(x=>p===x||p.startsWith(x.endsWith('/')?x:x+'/'));
}
export const documentKey=(url)=>'live:'+url.pathname+url.search;

export async function systemResolve(hostname){
 return (await dns.promises.lookup(hostname,{all:true,verbatim:true})).map(a=>a.address);
}
function pinnedLookup(host,address,family){
 return (hostname,options,callback)=>{
  if(typeof options==='function'){callback=options;options={};}
  process.nextTick(()=>hostname!==host?callback(Object.assign(Error('Unexpected lookup host'),{code:'ENOTFOUND'})):
   options?.all?callback(null,[{address,family}]):callback(null,address,family));
 };
}
function sameAddress(actual,expected){
 const type=(a)=>net.isIP(a)===6?'ipv6':'ipv4';
 if(typeof actual!=='string'||net.isIP(actual)===0)return false;
 const list=new net.BlockList();list.addAddress(expected,type(expected));
 return list.check(actual,type(actual));
}
/**
 * Production connector: port 443 and the system trust store. `ca` and `port`
 * exist only so tests can reach a local TLS server; the server never passes
 * them. The caller must have validated `address`; it is the only one dialled.
 */
export function createHttpsConnector({ca,port}={}){
 return ({url,address,family},{signal,connectTimeoutMs})=>new Promise((resolve,reject)=>{
  const req=https.request({hostname:url.hostname,port:port??443,path:url.pathname+url.search,method:'GET',
   servername:url.hostname,lookup:pinnedLookup(url.hostname,address,family),agent:false,ca,
   rejectUnauthorized:true,minVersion:'TLSv1.2',signal,
   headers:{'user-agent':'HarborPolicyMonitor/0.2 (approved-source adapter)',accept:'text/html, application/pdf',
    'accept-encoding':'identity'}});
  const timer=setTimeout(()=>req.destroy(timeoutError()),connectTimeoutMs);
  req.on('socket',socket=>socket.once('secureConnect',()=>clearTimeout(timer)));
  req.on('error',error=>{clearTimeout(timer);reject(error);});
  req.on('response',res=>{
   clearTimeout(timer);res.on('error',()=>{});
   if(!sameAddress(res.socket?.remoteAddress,address)){res.destroy();
    return reject(Object.assign(Error('Connected address differs from the validated address'),{code:'PIN_MISMATCH'}));}
   resolve({status:res.statusCode,headers:res.headers,body:res,discard:()=>res.destroy()});
  });
  req.end();
 });
}
const defaultConnect=createHttpsConnector();

/** A ref'd timer, so a stalled peer cannot outlive its deadline; always clear() it. */
function deadline(ms,parent){
 const controller=new AbortController(),abort=()=>controller.abort(timeoutError()),timer=setTimeout(abort,ms);
 parent?.addEventListener('abort',abort,{once:true});
 if(parent?.aborted)abort();
 return {signal:controller.signal,clear:()=>{clearTimeout(timer);parent?.removeEventListener('abort',abort);}};
}
/** Settle with `promise`, or reject when `signal` aborts even if the promise never settles. */
function race(promise,signal){
 return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(timeoutError());
  const stop=()=>reject(timeoutError());
  signal.addEventListener('abort',stop,{once:true});
  promise.then(v=>{signal.removeEventListener('abort',stop);if(signal.aborted)v?.discard?.();resolve(v);},
   e=>{signal.removeEventListener('abort',stop);reject(e);});
 });
}
function failureReason(error,signal){
 const code=String(error?.code||'');
 if(signal?.aborted||code==='ETIMEDOUT'||code==='ABORT_ERR'||error?.name==='AbortError')return 'timeout';
 if(code==='PIN_MISMATCH')return 'pin_mismatch';
 if(/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_/.test(code))return 'tls';
 return 'network';
}
// Shape check only: the PDF is never parsed, rendered or executed.
const pdfShape=(bytes)=>bytes.subarray(0,1024).includes('%PDF-')&&bytes.subarray(-1024).includes('%%EOF');

const RAW_TAGS=new Set(['script','style','noscript','template','iframe','object','svg','math']);
const BLOCK_TAGS=new Set(['address','article','aside','blockquote','br','dd','div','dl','dt','footer','form','h1','h2','h3',
 'h4','h5','h6','header','hr','li','main','nav','ol','p','pre','section','table','td','th','title','tr','ul']);
const ENTITIES={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
function decodeEntities(text){
 return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi,(all,name)=>{
  if(name[0]!=='#')return ENTITIES[name.toLowerCase()]??all;
  const code=/x/i.test(name[1])?parseInt(name.slice(2),16):Number(name.slice(1));
  return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'�';
 });
}
/**
 * Linear, script-free reading of HTML: visible text for the deterministic
 * normalizer, and <a href> values. Nothing else (img, script, css, iframe,
 * meta refresh, base) is ever requested.
 */
export function readHtml(html){
 const lower=html.toLowerCase(),links=[];let out='',i=0;
 while(i<html.length){
  const lt=html.indexOf('<',i);
  if(lt<0){out+=html.slice(i);break;}
  out+=html.slice(i,lt);
  if(lower.startsWith('<!--',lt)){const end=lower.indexOf('-->',lt+4);i=end<0?html.length:end+3;continue;}
  const head=lower.slice(lt,lt+64),tag=/^<(\/?)([a-z][a-z0-9-]*)/.exec(head);
  if(!tag&&!/^<[!?\/]/.test(head)){out+='<';i=lt+1;continue;}
  const gt=html.indexOf('>',lt);
  if(gt<0)break;
  i=gt+1;
  if(!tag)continue;
  const [,closing,name]=tag;
  if(!closing&&RAW_TAGS.has(name)){
   const close=lower.indexOf('</'+name,i),end=close<0?-1:html.indexOf('>',close);
   i=end<0?html.length:end+1;continue;
  }
  if(BLOCK_TAGS.has(name))out+='\n';
  if(name==='a'&&!closing){
   const href=/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(html.slice(lt,Math.min(gt,lt+4096)));
   if(href)links.push(decodeEntities(href[1]??href[2]??href[3]).trim());
  }
 }
 const text=decodeEntities(out).split('\n').map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');
 return {text,links};
}
function decodeHtml(bytes,contentType){
 const label=/charset\s*=\s*"?([\w-]{1,40})/i.exec(contentType)?.[1]||'utf-8';
 try{return new TextDecoder(label).decode(bytes);}catch{return new TextDecoder('utf-8').decode(bytes);}
}

/** One document: resolve, validate, connect pinned, and handle each redirect hop by hand. */
async function fetchDocument(start,policy,{resolve,connect},limits,signal){
 const hops=[];let url=start;
 const end=(outcome,reason,detail,extra)=>({outcome,reason,detail,hops,...extra});
 for(let redirects=0;;){
  let answers,address;
  try{answers=await race(Promise.resolve().then(()=>resolve(url.hostname)),signal);}
  catch(e){return end('failed',signal.aborted?'timeout':'dns_failed',message(e));}
  try{address=validateResolution(answers)[0];}
  catch(e){return end('failed','dns_blocked',e.message,{answers:Array.isArray(answers)?answers.slice(0,8).map(String):[]});}
  const hop={url:url.href,address};hops.push(hop);
  let res;
  try{res=await race(Promise.resolve().then(()=>connect({url,address,family:net.isIP(address)},
   {signal,connectTimeoutMs:limits.connectTimeoutMs})),signal);}
  catch(e){return end('failed',failureReason(e,signal),message(e));}
  const headers=res.headers||{};hop.status=res.status;
  if(REDIRECTS.has(res.status)){
   res.discard();
   const location=typeof headers.location==='string'?headers.location:'';
   if(!location)return end('failed','http_status','Redirect without a Location header',{httpStatus:res.status});
   try{url=redirectTarget(url.href,location.replace(/#[\s\S]*$/,''),policy.boundary,redirects++);}
   catch(e){return end('failed',/limit/i.test(e.message)?'redirect_limit':'redirect_rejected',e.message,{location:location.slice(0,300)});}
   if(!inApprovedPaths(url,policy.pathPrefixes))
    return end('failed','redirect_rejected','Redirect target is outside the approved path prefixes',{location:url.href.slice(0,300)});
   continue;
  }
  if(res.status!==200){res.discard();return end('failed','http_status',`HTTP ${res.status}`,{httpStatus:res.status});}
  const rawType=String(headers['content-type']??'');
  let contentType;
  try{
   contentType=validateMediaType(headers['content-type']);
   if(!policy.documentTypes.includes(contentType))throw Error('Content type is not approved for this source');
  }catch(e){res.discard();return end('skipped','wrong_type',e.message,{contentType:rawType.slice(0,100)});}
  try{validateResponseHeaders(200,headers,MAX_CAPTURE_BYTES);}
  catch(e){res.discard();return /exceeds byte budget/.test(e.message)?end('skipped','too_large',e.message):end('failed','bad_response',e.message);}
  let bytes;
  try{bytes=await race(collectBounded(res.body,{maxBytes:MAX_CAPTURE_BYTES,signal}),signal);}
  catch(e){res.discard();return /exceeds byte budget/.test(e.message)?end('skipped','too_large',e.message):end('failed',failureReason(e,signal),message(e));}
  const declared=headers['content-length'],sha256=sha(bytes),size=bytes.length;
  if(declared!==undefined&&size!==Number(declared))return end('failed','bad_response','Body length differs from Content-Length',{size});
  if(contentType==='application/pdf'&&!pdfShape(bytes))
   return end('failed','corrupt_pdf','PDF header or end-of-file marker missing; bytes not stored',{sha256,size});
  return end('captured',null,null,{contentType,sha256,size,finalUrl:url.href,bytes,rawType});
 }
}

/**
 * Poll one approved source breadth-first from its canonical URL. Returns every
 * URL decision in `entries` and the captured documents; it writes nothing.
 * `deps` (resolver, connector, tighter limits) is reachable from code only.
 */
export async function captureSource(policy,deps={}){
 const limits=tighten(deps.limits),resolve=deps.resolve||systemResolve,connect=deps.connect||defaultConnect;
 const startedAt=new Date().toISOString();
 const entries=[],documents=[];let attempted=0,bytesUsed=0,start;
 try{
  start=approvedUrl(policy.canonicalUrl,policy.boundary);
  if(!inApprovedPaths(start,policy.pathPrefixes))throw Error('Canonical URL is outside the approved path prefixes');
 }catch(e){
  entries.push({url:String(policy.canonicalUrl).slice(0,300),depth:0,outcome:'failed',reason:'policy_rejected',detail:message(e)});
  return {startedAt,entries,documents,limits};
 }
 const queue=[{url:start,depth:0}],seen=new Set([start.href]),poll=deadline(limits.pollTimeoutMs);
 try{while(queue.length){
  const {url,depth}=queue.shift(),entry={url:url.href,key:documentKey(url),depth};
  entries.push(entry);
  if(attempted>=limits.maxDocuments||bytesUsed>=limits.maxPollBytes||poll.signal.aborted){
   Object.assign(entry,{outcome:'skipped',reason:'budget',detail:'Per-poll document, byte or time budget exhausted'});continue;
  }
  attempted++;
  const doc=deadline(limits.requestTimeoutMs,poll.signal);
  let result;
  try{result=await fetchDocument(url,policy,{resolve,connect},limits,doc.signal);}finally{doc.clear();}
  const {bytes,rawType,...summary}=result;
  Object.assign(entry,summary);
  if(result.outcome!=='captured')continue;
  if(bytesUsed+bytes.length>limits.maxPollBytes){
   Object.assign(entry,{outcome:'skipped',reason:'budget',detail:'Per-poll byte budget exhausted'});continue;
  }
  bytesUsed+=bytes.length;
  const finalUrl=new URL(result.finalUrl),html=result.contentType==='text/html';
  const {text,links}=html?readHtml(decodeHtml(bytes,rawType)):{text:'',links:[]};
  documents.push({key:entry.key,depth,sourcePath:finalUrl.pathname+finalUrl.search,contentType:result.contentType,
   bytes,sha256:result.sha256,text,method:html?HTML_METHOD:PDF_METHOD,uncertain:html?0:1});
  if(links.length>limits.maxLinksPerPage)entries.push({url:url.href,depth:depth+1,outcome:'skipped',reason:'budget',
   detail:`${links.length-limits.maxLinksPerPage} link(s) beyond the per-page limit were not examined`});
  for(const href of links.slice(0,limits.maxLinksPerPage)){
   let link;
   try{link=new URL(href,finalUrl);link.hash='';}catch{continue;}
   if(seen.has(link.href))continue;
   seen.add(link.href);
   const skip=(reason,detail,key)=>entries.push({url:link.href.slice(0,300),key,depth:depth+1,outcome:'skipped',reason,detail});
   try{approvedUrl(link.href,policy.boundary);}catch(e){skip('out_of_scope',e.message);continue;}
   const key=documentKey(link);
   if(!inApprovedPaths(link,policy.pathPrefixes)){skip('out_of_scope','Outside the approved path prefixes',key);continue;}
   if(depth+1>policy.attachmentDepth){skip('depth',`Deeper than the approved attachment depth (${policy.attachmentDepth})`,key);continue;}
   if(attempted+queue.length>=limits.maxDocuments){skip('budget','Per-poll document budget exhausted',key);continue;}
   queue.push({url:link,depth:depth+1});
  }
 }}finally{poll.clear();}
 return {startedAt,entries,documents,limits};
}
