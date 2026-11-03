// @ts-nocheck
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectBounded,validateResponseHeaders} from '../response-capture';

test('response header policy enforces MIME, status, declared bytes and encoding',()=>{
 assert.equal(validateResponseHeaders(200,{'content-type':'application/pdf','content-length':'3'}),'application/pdf');
 for(const [status,headers] of [
  [404,{'content-type':'text/plain'}],
  [200,{'content-type':'text/javascript'}],
  [200,{'content-type':'application/pdf','content-length':'2000001'}],
  [200,{'content-type':'text/html','content-encoding':'gzip'}],
  [200,{'content-type':'text/plain','content-length':'-1'}],
  [200,{}]
 ] as const)assert.throws(()=>validateResponseHeaders(status,headers));
});

test('bounded collector retains exact original bytes',async()=>{
 async function* chunks(){yield Uint8Array.of(0,1);yield Uint8Array.of(2,255);}
 assert.deepEqual(await collectBounded(chunks(),{maxBytes:4}),Buffer.from([0,1,2,255]));
});

test('bounded collector rejects streaming overflow without trusting length',async()=>{
 async function* chunks(){yield Uint8Array.of(1,2);yield Uint8Array.of(3,4);}
 await assert.rejects(()=>collectBounded(chunks(),{maxBytes:3}),/byte budget/);
});

test('bounded collector stops on cancellation',async()=>{
 const controller=new AbortController();controller.abort();
 async function* chunks(){yield Uint8Array.of(1);}
 await assert.rejects(()=>collectBounded(chunks(),{signal:controller.signal}),/aborted/);
});
