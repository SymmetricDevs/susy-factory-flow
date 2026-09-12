import { describe, expect, it } from "vitest";
import {
  PLAN_SEARCH_MAX_LENGTH,
  applyPlanSearch,
  parsePlanSearch,
  withAuthor,
  withTag,
} from "./search-query";

describe("parsePlanSearch", () => {
  it("reads plain words as free text", () => {
    expect(parsePlanSearch("titanium line")).toEqual({
      tags: [],
      author: "",
      bareAuthor: false,
      text: "titanium line",
    });
  });

  it("reads one tag", () => {
    expect(parsePlanSearch("#oil").tags).toEqual(["oil"]);
  });

  it("stacks several tags, lowercased, without repeats", () => {
    expect(parsePlanSearch("#Oil #diesel #oil #EV").tags).toEqual(["oil", "diesel", "ev"]);
  });

  it("reads a creator exactly, underscores and all", () => {
    // The bug this pins: the free-text scrub turned dom_loid into "dom loid".
    expect(parsePlanSearch("@domb_loid").author).toBe("domb_loid");
    expect(parsePlanSearch("@Lord_Feverell99").author).toBe("Lord_Feverell99");
  });

  it("mixes tags, a creator and words in any order", () => {
    const search = parsePlanSearch("platline @UnseenHand #iv #closedloop titanium");
    expect(search).toEqual({
      tags: ["iv", "closedloop"],
      author: "UnseenHand",
      bareAuthor: false,
      text: "platline titanium",
    });
  });

  it("lets the last creator win, since a post has one author", () => {
    expect(parsePlanSearch("@one @two").author).toBe("two");
  });

  it("marks a bare @ so the search narrows to nobody, not everybody", () => {
    expect(parsePlanSearch("@")).toMatchObject({ author: "", bareAuthor: true });
    expect(parsePlanSearch("@ oil")).toMatchObject({ author: "", bareAuthor: true, text: "oil" });
    // A bare @ beside a real one is just noise.
    expect(parsePlanSearch("@ @brkge")).toMatchObject({ author: "brkge", bareAuthor: false });
  });

  it("drops a bare # and scrubs magic characters from tags and text, never the creator", () => {
    const search = parsePlanSearch("# #a%b (oil) 50% @a_b");
    expect(search.tags).toEqual(["a b"]);
    expect(search.text).toBe("oil  50");
    expect(search.author).toBe("a_b");
  });

  it("ignores stray whitespace and caps the length", () => {
    expect(parsePlanSearch("   #oil    steel   ")).toMatchObject({ tags: ["oil"], text: "steel" });
    const long = "x".repeat(PLAN_SEARCH_MAX_LENGTH + 50);
    expect(parsePlanSearch(long).text).toHaveLength(PLAN_SEARCH_MAX_LENGTH);
  });
});

describe("applyPlanSearch", () => {
  /** Records the narrowing calls in order, chaining like PostgREST does. */
  function recorder() {
    const calls: string[] = [];
    const query = {
      calls,
      ilike(column: string, pattern: string) {
        calls.push(`ilike ${column} ${pattern}`);
        return query;
      },
      eq(column: string, value: string) {
        calls.push(`eq ${column} ${JSON.stringify(value)}`);
        return query;
      },
      or(filters: string) {
        calls.push(`or ${filters}`);
        return query;
      },
    };
    return query;
  }

  it("narrows by every tag, then the creator, then the text", () => {
    const query = recorder();
    applyPlanSearch(query, parsePlanSearch("#oil #diesel @brkge fuel"));
    expect(query.calls).toEqual([
      "ilike tags_text %oil%",
      "ilike tags_text %diesel%",
      'eq author_name "brkge"',
      "or name.ilike.%fuel%,description.ilike.%fuel%,tags_text.ilike.%fuel%",
    ]);
  });

  it("does nothing for an empty search", () => {
    const query = recorder();
    applyPlanSearch(query, parsePlanSearch("   "));
    expect(query.calls).toEqual([]);
  });

  it("narrows a bare @ to nobody", () => {
    const query = recorder();
    applyPlanSearch(query, parsePlanSearch("@"));
    expect(query.calls).toEqual(['eq author_name ""']);
  });
});

describe("editing the search", () => {
  it("adds a tag once", () => {
    expect(withTag("", "Oil")).toBe("#oil");
    expect(withTag("steel #oil", "oil")).toBe("steel #oil");
    // A two-word tag travels as one word and parses back to itself.
    expect(withTag("", "early game")).toBe("#early_game");
    expect(parsePlanSearch(withTag("", "early game")).tags).toEqual(["early game"]);
    expect(withTag("steel", "diesel")).toBe("steel #diesel");
  });

  it("sets the creator, replacing any other", () => {
    expect(withAuthor("", "brkge")).toBe("@brkge");
    expect(withAuthor("#oil @old words", "new_name")).toBe("#oil words @new_name");
  });
});
