// @ts-nocheck
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {openDb,initDemo,resetDemo,replayOne,replayAll,getOverview,candidateDetails,reviewCandidate,createAction,updateAction,updateSource,makeDigest,searchArchive,evidencePacket} from './engine';

const HOST=process.env.HOST||'127.0.0.1';
const PORT=Number(process.env.PORT||4173);
const demo=process.env.DEMO_MODE!=='false';
if(!demo)throw Error('No live connectors are implemented. DEMO_MODE=false is not supported.');
const db=openDb(process.env.DB_PATH||path.resolve(__dirname,'../data/harbor.sqlite'));
initDemo(db);
const root=path.resolve(__dirname,'../public');
const jsRoot=path.resolve(__dirname,'../dist/frontend');
const json=(res,body,status=200)=>{
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));
};
const text=(res,body,status=200,contentType='text/plain; charset=utf-8')=>{
  res.writeHead(status,{'Content-Type':contentType,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(body);
};
async function body(req){
  let total=0,buf=[];
  for await(const chunk of req){total+=chunk.length;if(total>32768)throw Error('Request body exceeds 32 KB');buf.push(chunk);}
  try{return JSON.parse(Buffer.concat(buf).toString()||'{}');}catch{throw Error('Malformed JSON body');}
}
function assertLocal(req){
  const origin=req.headers.origin;
  const host=req.headers.host||'';
  if(origin && new URL(origin).host!==host)throw Error('Cross-origin writes are not permitted');
  if(req.headers['content-type']?.split(';')[0]!=='application/json')throw Error('JSON Content-Type required');
}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; connect-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  const url=new URL(req.url||'/',`http://${req.headers.host||'127.0.0.1'}`);
  const route=url.pathname;
  try{
    const hostHeader=req.headers.host||'';
    if(![`127.0.0.1:${PORT}`,`localhost:${PORT}`].includes(hostHeader))return json(res,{error:'Unrecognized local host'},400);
    if(route==='/api/health'&&req.method==='GET')return json(res,{ok:true,demo:true,networkMonitoring:false});
    if(route==='/api/overview'&&req.method==='GET')return json(res,getOverview(db));
    if(route==='/api/archive'&&req.method==='GET')return json(res,searchArchive(db,url.searchParams.get('q')));
    const candidate=route.match(/^\/api\/candidates\/([a-z0-9]+)$/);
    if(candidate&&req.method==='GET'){
      const detail=candidateDetails(db,candidate[1]);return detail?json(res,detail):json(res,{error:'Not found'},404);
    }
    const evidence=route.match(/^\/api\/candidates\/([a-z0-9]+)\/evidence\.json$/);
    if(evidence&&req.method==='GET'){
      const packet=evidencePacket(db,evidence[1]);
      if(!packet)return json(res,{error:'Not found'},404);
      res.setHeader('Content-Disposition',`attachment; filename="harbor-evidence-${evidence[1]}.json"`);
      return json(res,packet);
    }
    const original=route.match(/^\/api\/documents\/([a-z0-9]+)\/original$/);
    if(original&&req.method==='GET'){
      const doc=db.prepare(`SELECT d.original_bytes,d.content_type FROM document_versions d
        JOIN linked_documents l ON l.id=d.linked_document_id JOIN sources s ON s.id=l.source_id
        WHERE d.id=? AND s.org_id='harbor-demo'`).get(original[1]);
      if(!doc)return json(res,{error:'Not found'},404);
      res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':doc.content_type==='application/pdf'?'attachment; filename="original-evidence.pdf"':'attachment; filename="original-evidence.txt"',
        'Content-Security-Policy':'sandbox','X-Content-Type-Options':'nosniff'});
      return res.end(doc.original_bytes);
    }
    if(route.startsWith('/api/') && req.method==='POST'){
      assertLocal(req);
      const input=await body(req);
      if(route==='/api/demo/reset')return json(res,{results:resetDemo(db)});
      if(route==='/api/demo/replay-all')return json(res,{results:replayAll(db)});
      if(route==='/api/demo/poll')return json(res,replayOne(db,String(input.sourceId||''),false));
      const replay=route.match(/^\/api\/sources\/([a-z0-9-]+)\/replay$/);
      if(replay)return json(res,replayOne(db,replay[1]));
      const config=route.match(/^\/api\/sources\/([a-z0-9-]+)\/config$/);
      if(config)return json(res,updateSource(db,config[1],input));
      const review=route.match(/^\/api\/candidates\/([a-z0-9]+)\/review$/);
      if(review)return json(res,reviewCandidate(db,review[1],input));
      const action=route.match(/^\/api\/candidates\/([a-z0-9]+)\/action$/);
      if(action)return json(res,createAction(db,action[1],input));
      const actionEdit=route.match(/^\/api\/actions\/([a-z0-9-]+)\/update$/);
      if(actionEdit)return json(res,updateAction(db,actionEdit[1],input));
      if(route==='/api/digest/preview')return json(res,makeDigest(db));
      return json(res,{error:'API route not found'},404);
    }
    if(req.method!=='GET')return json(res,{error:'Method not permitted'},405);
    let target;
    if(route==='/'||route==='/index.html')target=path.join(root,'index.html');
    else if(route==='/styles.css')target=path.join(root,'styles.css');
    else if(route==='/main.js')target=path.join(jsRoot,'main.js');
    else return text(res,'Not found',404);
    const mime=route.endsWith('.css')?'text/css; charset=utf-8':route.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8';
    return text(res,fs.readFileSync(target),200,mime);
  }catch(err){
    const message=err instanceof Error?err.message:'Unknown error';
    const client=/Invalid|Unknown|not found|already|cannot|required|must be|out of|Cross-origin|Malformed|exceeds|unsupported|not permitted|Acknowledge|immutable|No live|Document type|Unapproved/.test(message);
    return json(res,{error:message},client?400:500);
  }
});
if(!Number.isInteger(PORT)||PORT<1024||PORT>65535)throw Error('PORT must be 1024 to 65535');
if(HOST!=='127.0.0.1'&&HOST!=='localhost')throw Error('This demo is loopback-only.');
server.listen(PORT,HOST,()=>console.log(`Harbor Policy Operations • DEMO ONLY • http://${HOST}:${PORT}`));
process.on('SIGINT',()=>{server.close();db.close();process.exit(0)});