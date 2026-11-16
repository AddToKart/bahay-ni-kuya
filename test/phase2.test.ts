import { describe, expect, it } from "bun:test";
import { Store } from "../src/store";
import type { IngestEvent } from "../src/types";

const OPENCODE = "opencode";

function seed(summoned: string, name: string, now = 1000) {
  const store = new Store();
  store.ingest({ harness: OPENCODE, type: "housemate_summoned", housemateKey: summoned, name }, now);
  store.ingest({ harness: OPENCODE, type: "housemate_arrived", housemateKey: summoned }, now + 100);
  return store;
}

describe("Phase 2 — PBB states and events", () => {
  it("summons, arrives, evicts, and removes a housemate", () => {
    const store = new Store();
    store.ingest({ harness: OPENCODE, type: "housemate_summoned", housemateKey: "hm_bea", name: "Bea" }, 1000);
    let snap = store.snapshot(1000);
    let session = snap.sessions.find((s) => s.sessionId === "hm_bea");
    expect(session?.state).toBe("arriving");
    expect(session?.title).toBe("Bea");

    store.ingest({ harness: OPENCODE, type: "housemate_arrived", housemateKey: "hm_bea" }, 2000);
    snap = store.snapshot(2000);
    session = snap.sessions.find((s) => s.sessionId === "hm_bea");
    expect(session?.state).toBe("idle");

    store.ingest({ harness: OPENCODE, type: "housemate_evict_started", housemateKey: "hm_bea" }, 3000);
    expect(store.snapshot(3000).sessions.find((s) => s.sessionId === "hm_bea")?.state).toBe("evicting");

    store.ingest({ harness: OPENCODE, type: "housemate_evicted", housemateKey: "hm_bea" }, 4000);
    expect(store.snapshot(4000).sessions.some((s) => s.sessionId === "hm_bea")).toBe(false);
  });

  it("queues question askers and promotes the next one on answer", () => {
    const store = seed("hm_bea", "Bea");
    store.ingest({ harness: OPENCODE, type: "housemate_summoned", housemateKey: "hm_ben", name: "Ben" }, 2000);
    store.ingest({ harness: OPENCODE, type: "housemate_arrived", housemateKey: "hm_ben" }, 2100);

    store.ingest(
      { harness: OPENCODE, type: "question_asked", housemateKey: "hm_bea", id: "q1", kind: "permission", text: "Pwede po?" },
      3000,
    );
    store.ingest(
      {
        harness: OPENCODE,
        type: "question_asked",
        housemateKey: "hm_ben",
        id: "q2",
        kind: "choice",
        text: "Anong gagawin?",
        options: ["A", "B"],
      },
      3100,
    );

    let snap = store.snapshot(3100);
    expect(snap.sessions.find((s) => s.sessionId === "hm_bea")?.state).toBe("in_confession");
    expect(snap.sessions.find((s) => s.sessionId === "hm_ben")?.state).toBe("queued_for_confession");
    expect(snap.questions.map((q) => q.id)).toEqual(["q1", "q2"]);

    store.ingest({ harness: OPENCODE, type: "question_answered", id: "q1", option: 0 }, 4000);
    snap = store.snapshot(4000);
    expect(snap.sessions.find((s) => s.sessionId === "hm_bea")?.state).toBe("idle");
    expect(snap.sessions.find((s) => s.sessionId === "hm_ben")?.state).toBe("in_confession");

    // answering an unknown question is rejected
    expect(store.ingest({ harness: OPENCODE, type: "question_answered", id: "nope" }, 4100).ok).toBe(false);
  });

  it("drops queued questions when their session dies and promotes the next asker", () => {
    const store = seed("hm_bea", "Bea");
    store.ingest({ harness: OPENCODE, type: "housemate_summoned", housemateKey: "hm_ben", name: "Ben" }, 2000);
    store.ingest(
      { harness: OPENCODE, type: "question_asked", housemateKey: "hm_bea", id: "q1", kind: "text", text: "A?" },
      3000,
    );
    store.ingest(
      { harness: OPENCODE, type: "question_asked", housemateKey: "hm_ben", id: "q2", kind: "text", text: "B?" },
      3100,
    );

    // bea (chair occupant) dies: ben must be promoted.
    store.ingest({ harness: OPENCODE, type: "session_end", sessionId: "hm_bea" }, 4000);
    const snap = store.snapshot(4000);
    expect(snap.questions.map((q) => q.id)).toEqual(["q2"]);
    expect(snap.sessions.find((s) => s.sessionId === "hm_ben")?.state).toBe("in_confession");
    expect(snap.sessions.some((s) => s.sessionId === "hm_bea")).toBe(false);
  });

  it("adds a guest as a child session of its host and removes it on leave", () => {
    const store = seed("hm_ben", "Ben");
    store.ingest({ harness: OPENCODE, type: "guest_arrived", guestKey: "hm_guest_1", hostKey: "hm_ben" }, 2000);
    let snap = store.snapshot(2000);
    const guest = snap.sessions.find((s) => s.sessionId === "hm_guest_1");
    expect(guest?.parentId).toBe("hm_ben");
    expect(guest?.guest).toBe(true);

    store.ingest({ harness: OPENCODE, type: "guest_left", guestKey: "hm_guest_1", hostKey: "hm_ben" }, 3000);
    snap = store.snapshot(3000);
    expect(snap.sessions.some((s) => s.sessionId === "hm_guest_1")).toBe(false);
  });

  it("keeps chat lines in the snapshot and clips them", () => {
    const store = seed("hm_bea", "Bea");
    store.ingest({ harness: OPENCODE, type: "chat_message", housemateKey: "hm_bea", role: "kuya", text: "Kumusta?" }, 2000);
    store.ingest({ harness: OPENCODE, type: "chat_message", housemateKey: "hm_bea", role: "housemate", text: "Okay po." }, 2100);
    const snap = store.snapshot(2100);
    expect(snap.chat.length).toBe(2);
    expect(snap.chat[0].role).toBe("kuya");
    expect(snap.chat[1].text).toBe("Okay po.");
  });

  it("keeps summoned housemates when the process scan sees no harness process", () => {
    const store = seed("hm_bea", "Bea");
    store.applyScan([], 5000);
    const snap = store.snapshot(5000);
    expect(snap.sessions.some((s) => s.sessionId === "hm_bea")).toBe(true);
  });

  it("rejects malformed v2 payloads", () => {
    const store = new Store();
    expect(store.ingest({ harness: OPENCODE, type: "question_asked", housemateKey: "hm_x", kind: "permission" } as IngestEvent).ok).toBe(false);
    expect(
      store.ingest({
        harness: OPENCODE,
        type: "question_asked",
        housemateKey: "hm_x",
        id: "q",
        kind: "choice",
        text: "Pick",
        options: [],
      } as IngestEvent).ok,
    ).toBe(false);
    expect(store.ingest({ harness: "nope", type: "housemate_arrived", housemateKey: "hm_x" } as IngestEvent).ok).toBe(false);
  });
});
