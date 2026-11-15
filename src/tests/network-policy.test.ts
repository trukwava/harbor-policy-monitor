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

test('IPv4 special-purpose ranges reject both endpoints',()=>{
 const ranges=[
  ['0.0.0.0','0.255.255.255'], ['10.0.0.0','10.255.255.255'],
  ['100.64.0.0','100.127.255.255'], ['127.0.0.0','127.255.255.255'],
  ['169.254.0.0','169.254.255.255'], ['172.16.0.0','172.31.255.255'],
  ['192.0.0.0','192.0.0.255'], ['192.0.2.0','192.0.2.255'],
  ['192.88.99.0','192.88.99.255'], ['192.168.0.0','192.168.255.255'],
  ['198.18.0.0','198.19.255.255'], ['198.51.100.0','198.51.100.255'],
  ['203.0.113.0','203.0.113.255'], ['224.0.0.0','239.255.255.255'],
  ['240.0.0.0','255.255.255.255']
 ];
 for(const ip of ranges.flat()){
  assert.equal(publicAddress(ip),false,ip);
  assert.throws(()=>validateResolution([ip]),undefined,ip);
  assert.throws(()=>validateResolution(['93.184.216.34',ip]),undefined,ip);
 }
});

test('public IPv4 addresses and adjacent ranges remain usable',()=>{
 const addresses=['1.1.1.1','8.8.8.8','93.184.216.34','100.63.255.255',
  '100.128.0.0','169.253.255.255','169.255.0.0','172.15.255.255',
  '172.32.0.0','192.0.1.255','192.0.3.0','192.167.255.255',
  '192.169.0.0','198.17.255.255','198.20.0.0','198.51.99.255',
  '198.51.101.0','203.0.112.255','203.0.114.0','223.255.255.255'];
 for(const ip of addresses)assert.equal(publicAddress(ip),true,ip);
 assert.deepEqual(validateResolution([...addresses,addresses[0]]),addresses);
});

test('mapped IPv4 and malformed addresses cannot bypass private checks',()=>{
 for(const ip of ['::ffff:127.0.0.1','::ffff:169.254.169.254',
  '::ffff:192.168.1.1','::ffff:7f00:1','garbage','127.1','256.1.1.1','']){
  assert.equal(publicAddress(ip),false,ip);
  assert.throws(()=>validateResolution(['1.1.1.1',ip]));
 }
 assert.equal(publicAddress('::ffff:8.8.8.8'),true);
 assert.deepEqual(validateResolution(['1.1.1.1','::ffff:8.8.8.8']),['1.1.1.1','::ffff:8.8.8.8']);
});

test('6to4 and Teredo cannot smuggle a blocked IPv4 address',()=>{
 for(const ip of ['2002:7f00:1::','2002:a9fe:a9fe::1','2002:808:808::',
  '2001:0:4136:e378:8000:63bf:3fff:fdd2','2001::1']){
  assert.equal(publicAddress(ip),false,ip);
 }
 assert.throws(()=>validateResolution(['8.8.8.8','2002:7f00:1::']));
});

test('IPv6 special-purpose ranges are denied in every spelling',()=>{
 for(const ip of ['2001:db8::1','2001:0db8::1','2001:DB8::1','2001:db8:0:0:0:0:0:1',
  '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff','3fff::1','3fff:fff:ffff::1',
  '2001:2::1','2001:3::1','2001:10::1','2001:1f:ffff::1','2001:20::1','2001:2f:ffff::1',
  '2001:30::1','2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff','::ffff:a00:1','::ffff:7f00:1',
  '::1.2.3.4','64:ff9b::808:808','5f00::1','100::1','fec0::1','ff02::1']){
  assert.equal(publicAddress(ip),false,ip);
  assert.throws(()=>validateResolution(['2606:4700:4700::1111',ip]),undefined,ip);
 }
});

test('scoped IPv6 addresses with a zone ID are rejected',()=>{
 for(const ip of ['fe80::1%eth0','fe80::1%1','2606:4700:4700::1111%eth0']){
  assert.equal(publicAddress(ip),false,ip);
 }
});

test('public IPv6 addresses next to denied ranges remain usable',()=>{
 const addresses=['2606:4700:4700::1111','2001:4860:4860::8888','2001:200::1',
  '2001:db7:ffff::1','2001:db9::1','2003::1','2001:1c00::1','3fff:1000::1',
  '::ffff:808:808','2001:4860:4860:0:0:0:0:8888'];
 for(const ip of addresses)assert.equal(publicAddress(ip),true,ip);
 assert.deepEqual(validateResolution(addresses),addresses);
});
