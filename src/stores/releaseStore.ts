import { ref } from "vue";
import { defineStore } from "pinia";
import { FUELS, fuelByCode } from "../data/fuels";
import {
  baselineFromEntry,
  disposalProblems,
  evaluateEntry,
  type Baseline,
} from "../domain/rules";
import type {
  DisposalConfirmation,
  DisposalOrder,
  EntryValues,
  EntryVersion,
  ShiftEntry,
} from "../domain/types";
import { loadState, resetState, saveState } from "../storage/repository";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export const useReleaseStore = defineStore("release", () => {
  const initial = loadState();
  const entries = ref<ShiftEntry[]>(initial.entries);
  const disposals = ref<DisposalOrder[]>(initial.disposals);
  const fuels = FUELS;

  function persist() {
    saveState({ entries: entries.value, disposals: disposals.value });
  }

  function entryById(id: string): ShiftEntry | undefined {
    return entries.value.find((entry) => entry.id === id);
  }

  function sortedEntries(fuelCode?: string): ShiftEntry[] {
    return entries.value
      .filter((entry) => !fuelCode || entry.fuelCode === fuelCode)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function latestEntry(fuelCode: string): ShiftEntry | undefined {
    const list = entries.value
      .filter((entry) => entry.fuelCode === fuelCode)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return list[list.length - 1];
  }

  function disposalForEntry(entryId: string): DisposalOrder | undefined {
    return disposals.value.find((order) => order.entryId === entryId);
  }

  function pendingDisposal(fuelCode: string): DisposalOrder | undefined {
    return disposals.value.find(
      (order) => order.fuelCode === fuelCode && order.status === "待处置"
    );
  }

  /** 有待确认处置单 = 该油品停发中 */
  function isSuspended(fuelCode: string): boolean {
    return Boolean(pendingDisposal(fuelCode));
  }

  /** 当前衔接基线：最新班次（含其已确认处置的复测值） */
  function baselineOf(fuelCode: string): Baseline | null {
    const latest = latestEntry(fuelCode);
    if (!latest) return null;
    return baselineFromEntry(latest, disposalForEntry(latest.id), fuelByCode(fuelCode));
  }

  /** 按记录保存的衔接来源还原基线，用于更正后重新判定 */
  function baselineForEntry(entry: ShiftEntry): Baseline | null {
    const prevId = entry.verdict.baselineEntryId;
    if (!prevId) return null;
    const prev = entryById(prevId);
    if (!prev) return null;
    return baselineFromEntry(prev, disposalForEntry(prev.id), fuelByCode(prev.fuelCode));
  }

  function openDisposal(entry: ShiftEntry) {
    disposals.value.push({
      id: crypto.randomUUID(),
      fuelCode: entry.fuelCode,
      entryId: entry.id,
      triggers: [...entry.verdict.triggers],
      status: "待处置",
      createdAt: new Date().toISOString(),
      pumpedLiters: null,
      remeasure: null,
      reviewer: "",
      confirmedAt: null,
      note: "",
    });
  }

  /** 登记交接：停发中的油品禁止登记；触发限值自动生成处置单 */
  function registerEntry(
    fuelCode: string,
    values: EntryValues
  ): ActionResult & { entry?: ShiftEntry } {
    if (isSuspended(fuelCode)) {
      return { ok: false, error: "该油品停发中，处置单未确认前不能继续登记发油" };
    }
    const verdict = evaluateEntry(values, fuelByCode(fuelCode), baselineOf(fuelCode));
    const entry: ShiftEntry = {
      id: crypto.randomUUID(),
      fuelCode,
      status: "待复核",
      values: { ...values },
      verdict,
      version: 1,
      versions: [],
      createdAt: new Date().toISOString(),
    };
    entries.value.push(entry);
    if (verdict.triggers.length > 0) {
      openDisposal(entry);
    }
    persist();
    return { ok: true, entry };
  }

  /** 复核通过即冻结，之后只能走补充更正 */
  function reviewEntry(id: string): ActionResult {
    const entry = entryById(id);
    if (!entry) return { ok: false, error: "记录不存在" };
    if (entry.status === "已复核") return { ok: false, error: "该班次已复核冻结" };
    entry.status = "已复核";
    persist();
    return { ok: true };
  }

  /** 冻结班次的补充更正：旧值整体存入版本，新值重新判定 */
  function correctEntry(
    id: string,
    values: EntryValues,
    reason: string,
    changedBy: string
  ): ActionResult {
    const entry = entryById(id);
    if (!entry) return { ok: false, error: "记录不存在" };
    if (entry.status !== "已复核") {
      return { ok: false, error: "仅已复核冻结的班次需要补充更正" };
    }
    if (!reason.trim()) return { ok: false, error: "请填写更正原因" };
    if (!changedBy.trim()) return { ok: false, error: "请填写更正人" };

    const version: EntryVersion = {
      version: entry.version,
      reason: reason.trim(),
      changedBy: changedBy.trim(),
      changedAt: new Date().toISOString(),
      snapshot: {
        values: { ...entry.values },
        verdict: { ...entry.verdict, triggers: [...entry.verdict.triggers] },
      },
    };
    entry.versions.push(version);
    entry.version += 1;
    entry.values = { ...values };
    entry.verdict = evaluateEntry(values, fuelByCode(entry.fuelCode), baselineForEntry(entry));
    if (entry.verdict.triggers.length > 0 && !pendingDisposal(entry.fuelCode)) {
      openDisposal(entry);
    }
    persist();
    return { ok: true };
  }

  /** 确认处置单：登记抽水回罐量、复测值、复核人后才恢复发油 */
  function confirmDisposal(
    id: string,
    confirmation: DisposalConfirmation
  ): { ok: boolean; problems: string[] } {
    const order = disposals.value.find((item) => item.id === id);
    if (!order || order.status === "已确认") {
      return { ok: false, problems: ["处置单不存在或已确认"] };
    }
    const candidate: DisposalOrder = { ...order, ...confirmation };
    const problems = disposalProblems(candidate);
    if (problems.length > 0) return { ok: false, problems };
    Object.assign(order, confirmation, {
      status: "已确认" as const,
      confirmedAt: new Date().toISOString(),
    });
    persist();
    return { ok: true, problems: [] };
  }

  /** 仅允许撤销本油品最新一条待复核、且未关联处置单的记录 */
  function removeEntry(id: string): ActionResult {
    const entry = entryById(id);
    if (!entry) return { ok: false, error: "记录不存在" };
    if (entry.status === "已复核") {
      return { ok: false, error: "已复核班次已冻结，请通过补充更正修改" };
    }
    if (disposalForEntry(entry.id)) {
      return { ok: false, error: "该记录已关联处置单，不能删除" };
    }
    if (latestEntry(entry.fuelCode)?.id !== entry.id) {
      return { ok: false, error: "仅可撤销本油品最新一条待复核记录" };
    }
    entries.value = entries.value.filter((item) => item.id !== id);
    persist();
    return { ok: true };
  }

  /** 版本经历：按油品汇总所有更正版本 */
  function versionHistory(fuelCode?: string): Array<{ entry: ShiftEntry; version: EntryVersion }> {
    return sortedEntries(fuelCode)
      .flatMap((entry) => entry.versions.map((version) => ({ entry, version })))
      .sort((a, b) => b.version.changedAt.localeCompare(a.version.changedAt));
  }

  function resetDemo() {
    const seed = resetState();
    entries.value = seed.entries;
    disposals.value = seed.disposals;
  }

  return {
    entries,
    disposals,
    fuels,
    entryById,
    sortedEntries,
    latestEntry,
    disposalForEntry,
    pendingDisposal,
    isSuspended,
    baselineOf,
    registerEntry,
    reviewEntry,
    correctEntry,
    confirmDisposal,
    removeEntry,
    versionHistory,
    resetDemo,
  };
});
