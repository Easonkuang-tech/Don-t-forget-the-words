import { describe, expect, it } from "vitest";
import {
  buildImageQuery,
  parseOpenverse,
  parseWikimedia
} from "./card-image.mjs";

describe("buildImageQuery", () => {
  it("uses the English definition for French words", () => {
    expect(
      buildImageQuery({
        word: "janvier",
        definition: "January (first month of the Gregorian calendar)",
        language: "fr"
      })
    ).toBe("January winter");
  });

  it("uses the Chinese meaning to resolve months even in an English deck", () => {
    expect(
      buildImageQuery({
        word: "avril",
        meaning: "四月",
        definition: "",
        language: "en"
      })
    ).toBe("April spring flowers");
  });

  it("falls back to the word and keeps English queries simple", () => {
    expect(
      buildImageQuery({ word: "bonjour", definition: "", language: "fr" })
    ).toBe("bonjour");
    expect(
      buildImageQuery({
        word: "semester",
        definition: "one of two divisions of an academic year",
        language: "en"
      })
    ).toBe("semester");
  });
});

describe("image result parsers", () => {
  it("parses the first usable Openverse image", () => {
    expect(
      parseOpenverse(
        {
          results: [
            { url: "https://example.test/a.jpg", thumbnail: "", mature: false },
            {
              url: "https://example.test/b.jpg",
              thumbnail: "https://example.test/b-thumb.jpg",
              foreign_landing_url: "https://example.test/b",
              attribution: "<b>Author</b> · CC BY",
              mature: false
            }
          ]
        },
        "January month"
      )
    ).toEqual({
      found: true,
      query: "January month",
      provider: "Openverse",
      imageUrl: "https://example.test/b.jpg",
      imageThumbUrl: "https://example.test/b-thumb.jpg",
      sourceUrl: "https://example.test/b",
      attribution: "Author · CC BY"
    });
  });

  it("prefers matching results and penalises unrelated portraits", () => {
    const parsed = parseOpenverse(
      {
        results: [
          {
            title: "Portrait of a woman",
            tags: [{ name: "portrait" }, { name: "woman" }],
            url: "https://example.test/person.jpg",
            thumbnail: "https://example.test/person-thumb.jpg",
            mature: false
          },
          {
            title: "April spring flowers",
            tags: [{ name: "april" }, { name: "spring" }, { name: "flowers" }],
            url: "https://example.test/april.jpg",
            thumbnail: "https://example.test/april-thumb.jpg",
            mature: false
          }
        ]
      },
      "April spring flowers"
    );
    expect(parsed?.imageUrl).toBe("https://example.test/april.jpg");
  });

  it("parses a Wikimedia image and skips non-photo files", () => {
    expect(
      parseWikimedia(
        {
          query: {
            pages: {
              1: {
                imageinfo: [{ mime: "application/pdf", thumburl: "https://x/pdf" }]
              },
              2: {
                imageinfo: [
                  {
                    mime: "image/jpeg",
                    thumburl: "https://x/photo.jpg",
                    descriptionurl: "https://x/photo",
                    extmetadata: {
                      Artist: { value: "<span>Photographer</span>" },
                      LicenseShortName: { value: "CC BY-SA 4.0" }
                    }
                  }
                ]
              }
            }
          }
        },
        "cat"
      )
    ).toEqual({
      found: true,
      query: "cat",
      provider: "Wikimedia Commons",
      imageUrl: "https://x/photo.jpg",
      imageThumbUrl: "https://x/photo.jpg",
      sourceUrl: "https://x/photo",
      attribution: "Photographer · CC BY-SA 4.0"
    });
  });
});
