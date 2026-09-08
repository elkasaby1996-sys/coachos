import { useCallback, useEffect, useRef, useState } from "react";

const databaseName = "repsync-private-drafts";
export const draftKey = (account: string, kind: string, record: string) =>
  JSON.stringify([account, kind, record]);

export async function draftStore<T>(
  key: string,
  operation: "read" | "write" | "delete",
  value?: T,
): Promise<T | undefined> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = database.transaction(
        "drafts",
        operation === "read" ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("drafts");
      const request =
        operation === "read"
          ? store.get(key)
          : operation === "write"
            ? store.put(value, key)
            : store.delete(key);
      tx.oncomplete = () =>
        resolve(operation === "read" ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}

type Envelope<T> = { version: string; value: T; savedAt: number };
export function useRecordDraft<T>({
  account,
  kind,
  record,
  version,
  enabled,
  onRestore,
}: {
  account?: string;
  kind: string;
  record?: string;
  version: string;
  enabled: boolean;
  onRestore: (value: T) => void;
}) {
  const key = account && record ? draftKey(account, kind, record) : null;
  const restore = useRef(onRestore);
  restore.current = onRestore;
  const [state, setState] = useState<{
    key: string | null;
    status: string;
    ready: boolean;
  }>({ key: null, status: "", ready: false });
  const active = useRef(key);
  active.current = key;
  const queue = useRef(Promise.resolve());
  const writeSequence = useRef(0);
  useEffect(() => {
    if (!key || !enabled) return;
    let cancelled = false;
    setState({ key, status: "Checking for a draft…", ready: false });
    void draftStore<Envelope<T>>(key, "read")
      .then((storedDraft) => {
        if (cancelled) return;
        let clearedAt = 0;
        try {
          clearedAt = Number(localStorage.getItem(`draft-cleared:${key}`)) || 0;
        } catch {
          /* IndexedDB still works without localStorage. */
        }
        const draft =
          storedDraft && storedDraft.savedAt > clearedAt
            ? storedDraft
            : undefined;
        if (draft?.version === version) restore.current(draft.value);
        setState({
          key,
          ready: true,
          status: draft
            ? draft.version === version
              ? "Draft restored on this device. Save or submit to share it with your coach."
              : "The form changed. Your older draft was not applied; review the current fields."
            : "",
        });
      })
      .catch(() => {
        if (!cancelled)
          setState({
            key,
            ready: true,
            status:
              "Draft storage is unavailable. Keep this page open until your changes are saved.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [key, version, enabled]);
  const save = useCallback(
    (value: T) => {
      if (!key || !enabled) return;
      const sequence = ++writeSequence.current;
      setState({ key, ready: true, status: "Saving draft on this device…" });
      queue.current = queue.current
        .catch(() => {})
        .then(() =>
          draftStore(key, "write", { version, value, savedAt: Date.now() }),
        )
        .then(() => {
          if (active.current === key && sequence === writeSequence.current)
            setState({
              key,
              ready: true,
              status:
                "Draft saved on this device. Save or submit to share it with your coach.",
            });
        })
        .catch(() => {
          if (active.current === key && sequence === writeSequence.current)
            setState({
              key,
              ready: true,
              status:
                "Draft could not be saved. Keep this page open and retry.",
            });
        });
    },
    [key, enabled, version],
  );
  const clear = useCallback(async () => {
    if (!key) return;
    await queue.current.catch(() => {});
    try {
      localStorage.setItem(`draft-cleared:${key}`, String(Date.now()));
    } catch {
      /* The database deletion remains authoritative. */
    }
    try {
      await draftStore(key, "delete");
    } catch {
      if (active.current === key)
        setState({
          key,
          ready: true,
          status:
            "This device could not remove the local draft. Reload before making further changes.",
        });
      return;
    }
    if (active.current === key) setState({ key, ready: true, status: "" });
  }, [key]);
  const status = state.key === key ? state.status : "";
  useEffect(() => {
    if (!status.includes("could not") && !status.startsWith("Saving")) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      if (
        (event.target as HTMLElement).closest("a[href]") &&
        !window.confirm(
          "Your changes have not been saved on this device. Leave this page?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", navigate, true);
    };
  }, [status]);
  return {
    save,
    clear,
    status,
    ready: Boolean(enabled && state.key === key && state.ready),
  };
}
