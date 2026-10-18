import { describe, expect, it } from "vitest";
import {
  buildImageQuery,
  parseWikipediaSummary,
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

  it("maps French number words to a number image query", () => {
    expect(
      buildImageQuery({
        word: "cinq",
        meaning: "5 五",
        definition: "five",
        language: "fr"
      })
    ).toBe("number 5");
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
  it("uses the curated main image from a Wikipedia article", () => {
    expect(
      parseWikipediaSummary(
        {
          title: "Janvier",
          type: "standard",
          thumbnail: { source: "https://example.test/janvier-thumb.jpg" },
          originalimage: { source: "https://example.test/janvier.jpg" },
          content_urls: {
            desktop: { page: "https://fr.wikipedia.org/wiki/Janvier" }
          }
        },
        "fr"
      )
    ).toEqual({
      found: true,
      query: "Janvier",
      provider: "Wikipedia (FR)",
      imageUrl: "https://example.test/janvier.jpg",
      imageThumbUrl: "https://example.test/janvier-thumb.jpg",
      sourceUrl: "https://fr.wikipedia.org/wiki/Janvier",
      attribution: "Wikipedia · Janvier"
    });
  });

  it("ignores Wikipedia disambiguation pages", () => {
    expect(
      parseWikipediaSummary(
        {
          title: "Cinq",
          type: "disambiguation",
          thumbnail: { source: "https://example.test/wrong.jpg" }
        },
        "fr"
      )
    ).toBeNull();
  });

  it("prefers matching Wikimedia results and penalises portraits", () => {
    const parsed = parseWikimedia(
      {
        query: {
          pages: {
            1: {
              title: "File:Portrait of a woman",
              imageinfo: [
                {
                  mime: "image/jpeg",
                  thumburl: "https://example.test/person.jpg",
                  descriptionurl: "https://example.test/person"
                }
              ]
            },
            2: {
              title: "File:April spring flowers",
              imageinfo: [
                {
                  mime: "image/jpeg",
                  thumburl: "https://example.test/april.jpg",
                  descriptionurl: "https://example.test/april"
                }
              ]
            }
          }
        }
      },
      "April spring flowers"
    );
    expect(parsed?.imageUrl).toBe("https://example.test/april.jpg");
  });

  it("penalises medical images when a normal result exists", () => {
    const parsed = parseWikimedia(
      {
        query: {
          pages: {
            1: {
              title: "File:Cat with feline viral rhinotracheitis",
              imageinfo: [
                {
                  mime: "image/jpeg",
                  thumburl: "https://example.test/sick-cat.jpg"
                }
              ]
            },
            2: {
              title: "File:Cat sleeping",
              imageinfo: [
                {
                  mime: "image/jpeg",
                  thumburl: "https://example.test/sleeping-cat.jpg"
                }
              ]
            }
          }
        }
      },
      "cat feline"
    );
    expect(parsed?.imageUrl).toBe("https://example.test/sleeping-cat.jpg");
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
