import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal, readCookie } from './session.mjs';
const cookies=[{name:'sessionid',value:'123:test'}];
test('encrypted transfer survives an isolated round trip and hides cookie plaintext',()=>{const token=seal(cookies,'transfer',1000);assert.deepEqual(unseal(token,'transfer',2000),cookies);assert.ok(!token.includes('123:test'));assert.equal(unseal(token,'session',2000),null);});
test('transfer expires after 10 minutes and tampering is rejected',()=>{const token=seal(cookies,'transfer',1000);assert.equal(unseal(token,'transfer',601001),null);const changed=Buffer.from(token,'base64url');changed[30]^=1;assert.equal(unseal(changed.toString('base64url'),'transfer',2000),null);assert.equal(unseal('invalid','transfer'),null);});
test('session cookies last seven days and are purpose-separated from transfer links',()=>{const token=seal(cookies,'session',1000);assert.deepEqual(unseal(token,'session',24*3600_000),cookies);assert.equal(unseal(token,'session',7*24*3600_000+1001),null);assert.equal(unseal(token,'transfer',2000),null);});
test('cookie parser does not confuse substrings or other values',()=>{assert.equal(readCookie('not_ig_session=wrong; ig_session=right; other=secret','ig_session'),'right');assert.equal(readCookie('', 'ig_session'),'');});
