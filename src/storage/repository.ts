import type { DisposalOrder, ShiftEntry } from "../domain/types";
import { buildSeed } from "../data/fuels";

export const STORAGE_KEY = "dfwlfront-7-release";

export interface PersistedState {
  entries: ShiftEntry[];
  disposals: DisposalOrder[];
}

/** 读取本地存档；无存档或数据损坏时回退到演示种子 */
export function loadState(): PersistedState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return buildSeed();
  try {
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.entries) || !Array.isArray(parsed.disposals)) {
      return buildSeed();
    }
    return parsed;
  } catch {
    return buildSeed();
  }
}

export function saveState(state: PersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** 清空存档并重置为演示种子 */
export function resetState(): PersistedState {
  const seed = buildSeed();
  saveState(seed);
  return seed;
}
