import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/voice/transcribe/route";

const token = "test-only-service-token-32-characters";
const fetchMock = vi.fn();
function request(body: BodyInit | null = "audio", headers: Record<string, string> = {}) {
  return new Request("http://localhost:3220/api/voice/transcribe", {
    method: "POST", body, headers: { origin: "http://localhost:3220", "content-type": "audio/webm;codecs=opus", ...headers },
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  });
}
beforeEach(() => {
  vi.stubEnv("STT_SERVICE_URL", "http://127.0.0.1:8767");
  vi.stubEnv("STT_SERVICE_TOKEN", token);
  fetchMock.mockReset().mockResolvedValue(Response.json({ text: "수원시에 살아요." }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("same-origin STT gateway", () => {
  it("forwards audio and a server-only secret but returns only the transcript", async () => {
    fetchMock.mockResolvedValue(Response.json({ text: "수원시", token, extra: "private" }));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ text: "수원시" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:8767/transcribe");
    expect(init.headers).toEqual({ Authorization: `Bearer ${token}`, "Content-Type": "audio/webm" });
    expect(init.redirect).toBe("error");
    expect(init.body.toString()).toBe("audio");
  });
  it.each(["https://attacker.example", "null", ""])("rejects a foreign/missing Origin %s before forwarding", async (origin) => {
    expect((await POST(request("audio", { origin }))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses the actual Host when Next normalizes the internal URL to localhost", async () => {
    expect((await POST(request("audio", { host: "127.0.0.1:3220", origin: "http://127.0.0.1:3220" }))).status).toBe(200);
    expect((await POST(request("audio", { host: "127.0.0.1:3220" }))).status).toBe(403);
    expect((await POST(request("audio", { host: "127.0.0.1:3220", "x-forwarded-host": "localhost:3220" }))).status).toBe(403);
  });
  it.each(["", "http://remote.example", "https://user:password@example.com", "https://example.com/private", "invalid"])("rejects unsafe/missing worker URL %s", async (url) => {
    vi.stubEnv("STT_SERVICE_URL", url);
    expect((await POST(request())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("supports a remote HTTPS worker so visitors need no local model", async () => {
    vi.stubEnv("STT_SERVICE_URL", "https://speech.example.com");
    expect((await POST(request())).status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://speech.example.com/transcribe");
  });
  it("requires a nontrivial worker secret", async () => {
    vi.stubEnv("STT_SERVICE_TOKEN", "short");
    expect((await POST(request())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects a non-audio body, an empty body, and a declared oversized body", async () => {
    expect((await POST(request("text", { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(request(null))).status).toBe(422);
    expect((await POST(request("", { "content-length": String(8 * 1024 * 1024 + 1) }))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bounds streamed bodies even without Content-Length", async () => {
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(8 * 1024 * 1024));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    } });
    expect((await POST(request(stream))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("limits concurrent buffered requests and releases capacity after completion", async () => {
    const resolve: ((response: Response) => void)[] = [];
    fetchMock.mockImplementation(() => new Promise((done) => { resolve.push(done); }));
    const first = POST(request()); const second = POST(request());
    expect((await POST(request())).status).toBe(429);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    resolve.forEach((done) => done(Response.json({ text: "ok" })));
    await Promise.all([first, second]);
    fetchMock.mockResolvedValue(Response.json({ text: "next" }));
    expect((await POST(request())).status).toBe(200);
  });
  it("releases a stalled upload after 15 seconds", async () => {
    vi.useFakeTimers();
    const pending = POST(request(new ReadableStream()));
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await pending).status).toBe(408);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([413, 422, 429, 503, 401, 500])("sanitizes upstream error %i", async (status) => {
    fetchMock.mockResolvedValue(new Response("private details " + token, { status }));
    const response = await POST(request());
    expect(response.status).toBe([413, 422, 429, 503].includes(status) ? status : 502);
    expect(await response.text()).not.toContain(token);
  });
  it.each([{}, { text: "" }, { text: "x".repeat(10_001) }])("rejects invalid upstream output", async (body) => {
    fetchMock.mockResolvedValue(Response.json(body));
    expect((await POST(request())).status).toBe(502);
  });
  it("does not leak network errors", async () => {
    fetchMock.mockRejectedValue(new Error(token));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(token);
  });
  it("health requires a ready authenticated worker", async () => {
    for (const ready of [false, true]) {
      fetchMock.mockResolvedValue(Response.json({ ready }));
      const response = await GET();
      expect(response.status).toBe(ready ? 200 : 503);
      expect(await response.json()).toEqual({ available: ready });
    }
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${token}`);
  });
});
