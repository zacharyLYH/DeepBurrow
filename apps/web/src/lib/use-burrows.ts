import { useCallback, useEffect, useState } from "react";
import type { Burrow } from "@deepburrow/types";
import { apiFetch } from "./api";

type Write = { burrow: Burrow } | { error: string };

const key = (userId: string) => `deepburrow:burrow:${userId}`;

export const recallBurrow = (userId: string) => localStorage.getItem(key(userId));

export const rememberBurrow = (userId: string, id: string) =>
  localStorage.setItem(key(userId), id);

const message = async (response: Response) =>
  ((await response.json().catch(() => ({}))) as { error?: string }).error ??
  `HTTP ${response.status}`;

const write = async (path: string, method: "POST" | "PATCH", body: unknown): Promise<Write> => {
  const response = await apiFetch(`/api${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.ok
    ? { burrow: ((await response.json()) as { burrow: Burrow }).burrow }
    : { error: await message(response) };
};

// The list is the source of truth for the sidebar; the selected burrow only
// names an id, so a rename never reloads its canvas.
export function useBurrows() {
  const [burrows, setBurrows] = useState<Burrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await apiFetch("/api/burrows");
      if (!response.ok) throw new Error(await message(response));
      setBurrows(((await response.json()) as { burrows: Burrow[] }).burrows);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const create = async (title: string): Promise<Write> => {
    const result = await write("/burrows", "POST", { title });
    if ("burrow" in result) setBurrows((current) => [...current, result.burrow]);
    return result;
  };

  // A rejected rename keeps the stored title, so the sidebar never lies.
  const rename = async (id: string, title: string): Promise<string | null> => {
    const result = await write(`/burrows/${id}`, "PATCH", { title });
    if ("error" in result) return result.error;
    setBurrows((current) => current.map((item) => (item.id === id ? result.burrow : item)));
    return null;
  };

  useEffect(() => {
    void load();
  }, [load]);

  return { burrows, loading, loadError, reload: load, create, rename };
}
