// ブラウザと同じ手順（WebCrypto の AES-GCM）で audio/01.bin と audio/check.bin を復号して確かめる。
// 実行：node tools/test_webcrypto.mjs
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const subtle = globalThis.crypto.subtle;

// base64url（パディングなし）を自前でデコードする。ブラウザでも同じ書き方で使える。
function b64urlDecode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function decryptBlob(key, buf) {
  const bytes = new Uint8Array(buf);
  const iv = bytes.subarray(0, 12);
  const data = bytes.subarray(12);
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, key, data));
}

const sha256 = (u8) => createHash('sha256').update(u8).digest('hex');

const keyText = (await readFile(path.join(root, 'secret/content_key.txt'), 'utf8')).trim();
const key = await subtle.importKey('raw', b64urlDecode(keyText), 'AES-GCM', false, ['decrypt']);

let failed = 0;

const plain01 = await readFile(path.join(root, 'build/plain/01.m4a'));
const dec01 = await decryptBlob(key, await readFile(path.join(root, 'audio/01.bin')));
const ok01 = sha256(dec01) === sha256(plain01);
if (!ok01) failed++;
console.log(`${ok01 ? 'OK ' : 'NG '} 01 ${sha256(dec01).slice(0, 16)} (${dec01.length} bytes)`);

const decCheck = new TextDecoder().decode(await decryptBlob(key, await readFile(path.join(root, 'audio/check.bin'))));
const okCheck = decCheck === 'nox-ok';
if (!okCheck) failed++;
console.log(`${okCheck ? 'OK ' : 'NG '} check ${JSON.stringify(decCheck)}`);

console.log(failed === 0 ? 'すべて一致' : `不一致 ${failed} 件`);
process.exit(failed ? 1 : 0);
