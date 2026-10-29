/**
 * Upload files into a Google Drive folder with a service account (the
 * nightly copy into the Harvard Drive, Amendment §58). Plain REST with
 * Node's crypto — no Google SDK dependency:
 *
 *   1. sign a JWT with the service account's private key (RS256);
 *   2. exchange it for an access token (OAuth 2.0 JWT bearer grant);
 *   3. multipart-upload each file into the folder (supportsAllDrives, so
 *      folders in shared drives work — service accounts have no storage
 *      of their own, so the folder MUST be in a shared drive).
 */
import { createSign } from "node:crypto";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_URI = "https://oauth2.googleapis.com/token";

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function parseServiceAccount(json: string | undefined): ServiceAccount | null {
  if (!json) return null;
  try {
    const sa = JSON.parse(json) as ServiceAccount;
    return sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

/** A signed JWT asking for Drive access as the service account. */
export function serviceAccountJwt(sa: ServiceAccount, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri ?? TOKEN_URI, iat: nowSec, exp: nowSec + 3600 }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
}

export async function getAccessToken(sa: ServiceAccount, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(sa.token_uri ?? TOKEN_URI, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: serviceAccountJwt(sa),
    }).toString(),
  });
  if (!res.ok) throw new Error(`Google refused the service account (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Google returned no access token");
  return body.access_token;
}

export interface UploadedFile {
  id: string;
  name: string;
  bytes: number;
}

/** Multipart upload of one file into a folder (shared drives supported). */
export async function uploadToDrive(
  token: string,
  folderId: string,
  file: { name: string; mimeType: string; data: Uint8Array },
  fetchImpl: typeof fetch = fetch,
): Promise<UploadedFile> {
  const boundary = `clobs-${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: file.name, parents: [folderId], mimeType: file.mimeType });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`),
    Buffer.from(file.data),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetchImpl(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!res.ok) throw new Error(`Drive refused the upload of ${file.name} (${res.status}): ${await res.text()}`);
  const out = (await res.json()) as { id: string; name: string };
  return { id: out.id, name: out.name, bytes: file.data.length };
}
