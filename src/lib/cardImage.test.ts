import { describe, expect, it } from "vitest";
import {
  EMPTY_CARD_IMAGE,
  cardImageFields,
  findCardImage,
  storagePathFromPublicUrl
} from "./cardImage";

describe("card image client", () => {
  it("returns an empty result for an empty word", async () => {
    expect(await findCardImage({ word: "  ", language: "fr" })).toEqual(
      EMPTY_CARD_IMAGE
    );
  });

  it("maps a result to card fields and keeps a thumbnail fallback", () => {
    expect(
      cardImageFields({
        found: true,
        query: "January month",
        provider: "Wikimedia Commons",
        imageUrl: "https://example.test/full.jpg",
        imageThumbUrl: "",
        sourceUrl: "https://example.test/source",
        attribution: "Author"
      })
    ).toEqual({
      imageUrl: "https://example.test/full.jpg",
      imageThumbUrl: "https://example.test/full.jpg",
      imageAttribution: "Author",
      imageSourceUrl: "https://example.test/source",
      imageOrigin: "auto"
    });
  });

  it("extracts the storage path from a Supabase public image URL", () => {
    expect(
      storagePathFromPublicUrl(
        "https://example.supabase.co/storage/v1/object/public/card-images/user-1/photo.jpg?token=1"
      )
    ).toBe("user-1/photo.jpg");
    expect(storagePathFromPublicUrl("https://example.test/photo.jpg")).toBeNull();
  });
});
