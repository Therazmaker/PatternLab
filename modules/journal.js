const NOTES_KEY = "patternlab.notes.v1";

export function loadNotes() {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveNotes(notes) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

export function buildNote(payload) {
  const now = new Date().toISOString();
  return {
    id: payload.id || `note_${Math.random().toString(36).slice(2, 9)}`,
    title: payload.title.trim(),
    content: payload.content.trim(),
    tags: payload.tags,
    links: {
      patternName: payload.patternName || "",
      asset: payload.asset || "",
      signalId: payload.signalId || "",
    },
    createdAt: payload.createdAt || now,
    updatedAt: now,
  };
}

export function upsertNote(notes, payload) {
  const next = buildNote(payload);
  if (!payload.id) return [next, ...notes];
  return notes.map((note) => (note.id === payload.id ? { ...next, createdAt: payload.createdAt || note.createdAt } : note));
}

export function filterNotes(notes, filters) {
  const term = filters.search.trim().toLowerCase();
  return notes.filter((note) => {
    if (filters.tag && !note.tags.includes(filters.tag)) return false;
    if (filters.patternName && note.links.patternName !== filters.patternName) return false;
    if (filters.asset && note.links.asset !== filters.asset) return false;
    if (term) {
      const hay = [note.title, note.content, note.tags.join(" "), note.links.patternName, note.links.asset].join(" ").toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}
