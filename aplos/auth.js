import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import forge from 'node-forge';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

for (const line of readFileSync(path.join(scriptDir, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

export const APLOS_BASE = 'https://app.aplos.com/hermes/api/v1';

export async function getAccessToken() {
  const clientId = process.env.APLOS_CLIENT_ID;
  const keyPath = process.env.APLOS_PRIVATE_KEY_PATH;
  if (!clientId || !keyPath) throw new Error('Missing APLOS_CLIENT_ID or APLOS_PRIVATE_KEY_PATH');

  const rawKey = readFileSync(path.resolve(scriptDir, keyPath), 'utf8').trim();
  const pem = rawKey.includes('-----BEGIN')
    ? rawKey
    : `-----BEGIN PRIVATE KEY-----\n${rawKey.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;

  const res = await fetch(`${APLOS_BASE}/auth/${clientId}`);
  const body = await res.json();
  if (!body?.data?.token) throw new Error(`Auth failed: ${JSON.stringify(body)}`);

  const privateKey = forge.pki.privateKeyFromPem(pem);
  return privateKey.decrypt(forge.util.decode64(body.data.token), 'RSAES-PKCS1-V1_5');
}

export async function aplos(token, pathAndQuery, { method = 'GET', body } = {}) {
  const res = await fetch(`${APLOS_BASE}${pathAndQuery}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const token = await getAccessToken();
  console.log('Got token:', token.slice(0, 20) + '...');
}
