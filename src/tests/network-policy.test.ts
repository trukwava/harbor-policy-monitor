// @ts-nocheck
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {approvedUrl, publicAddress, redirectTarget, validateResolution} from '../network-policy';

const policy={approvedHost:'agency.gov',maxRedirects:2};

test('only administrator-approved exact HTTPS host is permitted',()=>{
 assert.equal(approvedUrl('https://agency.gov/docs/bulletin.pdf',policy).hostname,'agency.gov');
 for(const url of ['http://agency.gov/','https://agency.gov.evil.com/',
   'https://sub.agency.gov/','https://agency.gov:8443/','https://admin:pw@agency.gov/',
   'https://127.0.0.1/','file:///etc/passwd','https://agency.gov/#section']){
  assert.throws(()=>approvedUrl(url,policy));
 }
});

test('DNS resolution rejects all-private and mixed private/public answers',()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','172.16.0.1',
    '192.168.1.1','0.0.0.0','224.0.0.1','::1','fe80::1','fc00::1','2001:db8::1']){
  assert.equal(publicAddress(ip),false,ip);
 }
 assert.equal(publicAddress('8.8.8.8'),true);
 assert.deepEqual(validateResolution(['8.8.8.8','8.8.8.8']),['8.8.8.8']);
 assert.throws(()=>validateResolution(['8.8.8.8','127.0.0.1']));
 assert.throws(()=>validateResolution([]));
});

test('redirects remain on approved host and within hop limit',()=>{
 assert.equal(redirectTarget('https://agency.gov/a','/b',policy,0).pathname,'/b');
 assert.throws(()=>redirectTarget('https://agency.gov/a','https://attacker.test/',policy,0));
 assert.throws(()=>redirectTarget('https://agency.gov/a','/b',policy,2));
});

test('URL validation rejects special internal host labels',()=>{
 assert.throws(()=>approvedUrl('https://localhost/',{approvedHost:'localhost'}));
 assert.throws(()=>approvedUrl('https://foo.internal/',{approvedHost:'foo.internal'}));
});
