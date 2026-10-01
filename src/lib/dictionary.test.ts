import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupDictionary, translateText } from "./dictionary";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function htmlNotFound(): Response {
  return new Response("<html>Not found</html>", {
    status: 404,
    headers: { "Content-Type": "text/html" }
  });
}

describe("dictionary client fallbacks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("translates a phrase when the local API is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(htmlNotFound())
      .mockResolvedValueOnce(
        jsonResponse({
          responseData: { translatedText: "超越他们" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(translateText("Outperform them")).resolves.toBe("超越他们");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("creates a dictionary result for a word through public translation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(htmlNotFound())
      .mockResolvedValueOnce(
        jsonResponse({
          responseData: { translatedText: "公司的" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupDictionary("corporate");
    expect(result.found).toBe(true);
    expect(result.entries[0].translation).toBe("公司的");
  });

  it("returns a readable error when all translation services fail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(htmlNotFound())
      .mockResolvedValueOnce(htmlNotFound());
    vi.stubGlobal("fetch", fetchMock);

    await expect(translateText("Outperform them")).rejects.toThrow(
      "在线翻译暂时不可用"
    );
  });
});
