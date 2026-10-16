export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const AUDIO_TYPES = new Set(["audio/webm", "video/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/x-wav"]);
// Bound buffered audio per web-server process; the worker allows one inference.
let inFlight = 0;
const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function config() {
  const value = process.env.STT_SERVICE_URL;
  const token = process.env.STT_SERVICE_TOKEN;
  if (!value || !token || token.length < 32) return null;
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if ((!localHttp && url.protocol !== "https:")
      || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return { url, token };
  } catch { return null; }
}

export async function GET() {
  const service = config();
  if (!service) return json({ available: false }, 503);
  try {
    const response = await fetch(new URL("health", service.url), {
      headers: { Authorization: `Bearer ${service.token}` },
      signal: AbortSignal.timeout(3_000), cache: "no-store", redirect: "error",
    });
    const ready = response.ok && (await response.json()).ready === true;
    return json({ available: ready }, ready ? 200 : 503);
  } catch { return json({ available: false }, 503); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Next may normalize its internal URL to localhost. Host retains the authority
  // the browser actually addressed; never take an arbitrary forwarded host.
  const url = new URL(request.url);
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") ?? url.host}`;
  if (origin !== expectedOrigin) return json({ error: "invalid_origin" }, 403);
  const service = config();
  if (!service) return json({ error: "unavailable" }, 503);
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!AUDIO_TYPES.has(type)) return json({ error: "unsupported_audio" }, 415);
  const length = Number(request.headers.get("content-length"));
  if (length > MAX_BYTES) return json({ error: "audio_too_large" }, 413);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "empty_audio" }, 422);
  if (inFlight >= 2) { await reader.cancel(); reader.releaseLock(); return json({ error: "busy" }, 429); }
  inFlight++;
  const chunks: Uint8Array[] = [];
  let size = 0;
  let bodyExpired = false;
  const bodyTimer = setTimeout(() => { bodyExpired = true; void reader.cancel().catch(() => {}); }, 15_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return json({ error: "audio_too_large" }, 413); }
      chunks.push(value);
    }
    if (bodyExpired) return json({ error: "upload_timeout" }, 408);
    clearTimeout(bodyTimer);
    if (!size) return json({ error: "empty_audio" }, 422);
    const response = await fetch(new URL("transcribe", service.url), {
      method: "POST", body: Buffer.concat(chunks),
      headers: { Authorization: `Bearer ${service.token}`, "Content-Type": type },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(115_000)]),
      cache: "no-store", redirect: "error",
    });
    if (!response.ok) {
      const status = [413, 422, 429, 503].includes(response.status) ? response.status : 502;
      return json({ error: "transcription_failed" }, status);
    }
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("text" in data) || typeof data.text !== "string" || !data.text.trim() || data.text.length > 10_000) {
      return json({ error: "invalid_response" }, 502);
    }
    return json({ text: data.text });
  } catch { return json({ error: "unavailable" }, 503); }
  finally { clearTimeout(bodyTimer); reader.releaseLock(); inFlight--; }
}
