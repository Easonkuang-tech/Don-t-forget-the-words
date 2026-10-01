export interface LocalSession {
  name: string;
  loggedInAt: number;
}

const STORAGE_KEY = "reploop-local-session";

export function readLocalSession(): LocalSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<LocalSession>;
    if (
      typeof parsed.name !== "string" ||
      typeof parsed.loggedInAt !== "number"
    ) {
      return null;
    }
    return {
      name: parsed.name,
      loggedInAt: parsed.loggedInAt
    };
  } catch {
    return null;
  }
}

export function createLocalSession(name: string): LocalSession {
  const session = {
    name: name.trim(),
    loggedInAt: Date.now()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearLocalSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
