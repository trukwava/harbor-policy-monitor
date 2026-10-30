// @ts-nocheck
/** End-to-end local HTTP contract, without relying on a graphical browser. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';

const unusedPort=async()=>await new Promise<number>((resolve,reject)=>{
  const server=net.createServer();
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{
    const port=(server.address() as net.AddressInfo).port;
    server.close(()=>resolve(port));
  });
});
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('HTTP: offline queue, receipt, origin gate, review and action persistence',async()=>{
  const root=path.resolve(__dirname,'../..');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'harbor-http-'));
  const port=await unusedPort();
  const child=spawn(process.execPath,[path.join(root,'dist/server.js')],{
    cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DB_PATH:path.join(temp,'test.sqlite'),DEMO_MODE:'true'},
    stdio:'ignore'
  });
  const base=`http://127.0.0.1:${port}`;
  try{
    let healthy=false;
    for(let i=0;i<70;i++){
      if(child.exitCode!==null)throw Error('Local server exited during startup');
      try{const response=await fetch(`${base}/api/health`);if(response.ok){healthy=true;break;}}catch{}
      await pause(70);
    }
    assert.equal(healthy,true,'server should start within five seconds');
    const overview=await (await fetch(`${base}/api/overview`)).json();
    assert.equal(overview.stats.sources,5);
    assert.equal(overview.stats.coverageFailures,1);
    const candidate=overview.candidates.find(c=>c.source_id==='housing');
    assert.ok(candidate);
    const response=await fetch(`${base}/api/candidates/${candidate.id}/evidence.json`);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-disposition'),/attachment/);
    const packet=await response.json();
    assert.equal(packet.integrity.state,'verified');
    assert.ok(packet.immutable.hunks.some(h=>h.before.includes('$2,000')&&h.after.includes('$2,500')));
    const post=(url:string,payload:any,headers={})=>fetch(`${base}${url}`,{
      method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload)
    });
    const badOrigin=await post(`/api/candidates/${candidate.id}/review`,{
      classification:'relevant',reviewer:'QA',note:'Inspected source'
    },{Origin:'https://untrusted.example'});
    assert.equal(badOrigin.status,400);
    const review=await post(`/api/candidates/${candidate.id}/review`,{
      classification:'relevant',reviewer:'QA',note:'Inspected source'
    });
    assert.equal(review.status,200);
    const action=await post(`/api/candidates/${candidate.id}/action`,{
      owner:'QA Operations',dueDate:'2026-11-04',note:'Check synthetic forms'
    });
    assert.equal(action.status,200);
    const summary=await (await fetch(`${base}/api/overview`)).json();
    assert.equal(summary.stats.unresolvedActions,1);
    const packet2=await (await fetch(`${base}/api/candidates/${candidate.id}/evidence.json`)).json();
    assert.equal(packet2.receiptSha256,packet.receiptSha256);
    assert.equal(packet2.action.owner,'QA Operations');
    const spoofedStatus=await new Promise<number>((resolve,reject)=>{
      const req=http.request({hostname:'127.0.0.1',port,path:'/api/health',headers:{Host:'malicious.example'}},res=>{
        res.resume();res.on('end',()=>resolve(res.statusCode||0));
      });req.on('error',reject);req.end();
    });
    assert.equal(spoofedStatus,400);
    const notFound=await fetch(`${base}/api/candidates/00000000000000000000000000000000/evidence.json`);
    assert.equal(notFound.status,404);
  }finally{
    child.kill('SIGINT');
    fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:80});
  }
});