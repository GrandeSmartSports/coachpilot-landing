// Shared Web Push sender (RFC 8291 aes128gcm + VAPID), used by flm-reminders
// for practice check-ins (v21, 2026-11-06). flm-gateway keeps its own inline
// copy of this same logic untouched — it's the live, high-traffic path and
// this repo's rule is additive-only changes there. This file exists so a new
// caller (flm-reminders) doesn't have to hand-copy ~130 lines of crypto.
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:daniel@cueops.io";

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bytesToB64Url(b: Uint8Array | ArrayBuffer): string {
  const arr = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function importVapidPrivateKey(privRaw: string): Promise<CryptoKey> {
  const priv = b64urlToBytes(privRaw);
  const pub = b64urlToBytes(VAPID_PUBLIC);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("VAPID public key must be uncompressed P-256 (65 bytes)");
  const x = bytesToB64Url(pub.slice(1, 33));
  const y = bytesToB64Url(pub.slice(33, 65));
  const d = bytesToB64Url(priv);
  return await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, ext: true } as JsonWebKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}
async function makeVapidJwt(audience: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: audience, exp: now + 12 * 3600, sub: VAPID_SUBJECT };
  const enc = new TextEncoder();
  const headerB64 = bytesToB64Url(enc.encode(JSON.stringify(header)));
  const claimsB64 = bytesToB64Url(enc.encode(JSON.stringify(claims)));
  const signInput = `${headerB64}.${claimsB64}`;
  const key = await importVapidPrivateKey(VAPID_PRIVATE);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signInput));
  return `${signInput}.${bytesToB64Url(sig)}`;
}
async function encryptPushPayload(payload: Uint8Array, clientPubKeyB64: string, authSecretB64: string): Promise<Uint8Array> {
  const clientPub = b64urlToBytes(clientPubKeyB64);
  const authSecret = b64urlToBytes(authSecretB64);
  const serverKey = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKey.publicKey));
  const clientPubKey = await crypto.subtle.importKey("raw", clientPub, { name: "ECDH", namedCurve: "P-256" }, true, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientPubKey }, serverKey.privateKey, 256));
  async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
    const keyPrk = await crypto.subtle.importKey("raw", salt, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info } as unknown as HkdfParams, keyPrk, len * 8));
  }
  const infoPart1 = new TextEncoder().encode("WebPush: info\0");
  const info1 = new Uint8Array(infoPart1.length + clientPub.length + serverPubRaw.length);
  info1.set(infoPart1, 0);
  info1.set(clientPub, infoPart1.length);
  info1.set(serverPubRaw, infoPart1.length + clientPub.length);
  const ikm = await hkdf(authSecret, shared, info1, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const padded = new Uint8Array(payload.length + 1);
  padded.set(payload, 0);
  padded[payload.length] = 0x02;
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, padded));
  const rs = new Uint8Array([0, 0, 0x10, 0]);
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  header.set(rs, 16);
  header[20] = 65;
  header.set(serverPubRaw, 21);
  const out = new Uint8Array(header.length + cipher.length);
  out.set(header, 0);
  out.set(cipher, header.length);
  return out;
}
export async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<{ ok: boolean; status?: number }> {
  if (!VAPID_PRIVATE || !VAPID_PUBLIC) return { ok: false };
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await makeVapidJwt(audience);
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const encBody = await encryptPushPayload(body, sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "TTL": "60",
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Authorization": `vapid t=${jwt}, k=${VAPID_PUBLIC}`,
    },
    body: encBody,
  });
  return { ok: res.ok, status: res.status };
}
