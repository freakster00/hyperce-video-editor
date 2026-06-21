export const AUTH_COOKIE_NAME = "sora_editor_auth";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface AuthPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeText(value: string) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlDecodeText(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function authSecret() {
  return (
    process.env.AUTH_JWT_SECRET ||
    process.env.JWT_SECRET ||
    process.env.AUTH_PASSWORD ||
    process.env.EDITOR_PASSWORD ||
    ""
  );
}

async function signInput(input: string, required = true) {
  const secret = authSecret();
  if (!secret) {
    if (!required) return null;
    throw new Error("Missing AUTH_JWT_SECRET or AUTH_PASSWORD.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

export async function createAuthToken(email: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthPayload = {
    sub: email,
    email,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  };
  const header = base64UrlEncodeText(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncodeText(JSON.stringify(payload));
  const input = `${header}.${body}`;
  const signature = await signInput(input);
  if (!signature) {
    throw new Error("Missing AUTH_JWT_SECRET or AUTH_PASSWORD.");
  }
  return `${input}.${signature}`;
}

export async function verifyAuthToken(token?: string | null) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expectedSignature = await signInput(`${header}.${body}`, false);
  if (!expectedSignature) return null;
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecodeText(body)) as Partial<AuthPayload>;
    if (!payload.email || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload as AuthPayload;
  } catch {
    return null;
  }
}

export function readAuthCredentials() {
  return {
    username:
      process.env.AUTH_USERNAME ||
      process.env.AUTH_EMAIL ||
      process.env.EDITOR_USERNAME ||
      process.env.EDITOR_EMAIL ||
      "",
    password: process.env.AUTH_PASSWORD || process.env.EDITOR_PASSWORD || ""
  };
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS
  };
}
