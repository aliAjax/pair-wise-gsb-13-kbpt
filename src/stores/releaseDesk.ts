import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { PRODUCTS } from "../domain/catalog";
import {
  canRestore,
  createReading,
  deriveReading,
  evaluateReading,
  toPrevRef,
  validateValues,
} from "../domain/rules";
import { loadState, saveState } from "../data/storage";
import type {
  CorrectionVersion,
  DisposalOrder,
  ReadingValues,
  RetestValues,
  ShiftLabel,
  TankReading,
} from "../domain/types";

type Result = { ok: boolean; error?: string };

const SHIFT_ORDER: Record<ShiftLabel, number> = { 早班: 0, 中班: 1, 晚班: 2 };

export const useReleaseDeskStore = defineStore("releaseDesk", () => {
  const persisted = loadState();
  const readings = ref<TankReading[]>(persisted.readings);
  const orders = ref<DisposalOrder[]>(persisted.orders);
  const versions = ref<CorrectionVersion[]>(persisted.versions);

  function persist() {
    saveState({ readings: readings.value, orders: orders.value, versions: versions.value });
  }

  // ---------- 查询 ----------

  function readingsOf(productCode: string): TankReading[] {
    return readings.value.filter((reading) => reading.productCode === productCode);
  }

  function latestReading(productCode: string): TankReading | null {
    const list = readingsOf(productCode);
    return list.length > 0 ? list[list.length - 1] : null;
  }

  function readingById(id: string): TankReading | null {
    return readings.value.find((reading) => reading.id === id) ?? null;
  }

  function openOrderFor(productCode: string): DisposalOrder | null {
    return (
      orders.value.find(
        (order) => order.productCode === productCode && order.status === "待处置"
      ) ?? null
    );
  }

  /** 存在未确认处置单即停止发油 */
  function isBlocked(productCode: string): boolean {
    return openOrderFor(productCode) !== null;
  }

  function sortedReadings(productCode: string): TankReading[] {
    const list =
      productCode === "all" ? [...readings.value] : readingsOf(productCode);
    return list.sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        SHIFT_ORDER[b.shift] - SHIFT_ORDER[a.shift] ||
        b.createdAt.localeCompare(a.createdAt)
    );
  }

  const productSummaries = computed(() =>
    PRODUCTS.map((product) => {
      const latest = latestReading(product.code);
      const openOrder = openOrderFor(product.code);
      return { product, latest, blocked: openOrder !== null, openOrder };
    })
  );

  const activeCount = computed(
    () => PRODUCTS.filter((product) => !isBlocked(product.code)).length
  );
  const blockedCount = computed(
    () => PRODUCTS.filter((product) => isBlocked(product.code)).length
  );
  const openOrderCount = computed(
    () => orders.value.filter((order) => order.status === "待处置").length
  );
  const reviewedCount = computed(
    () => readings.value.filter((reading) => reading.reviewStatus === "已复核").length
  );

  // ---------- 动作 ----------

  /** 登记班次罐检：判定超标自动停发并生成处置单 */
  function registerReading(input: {
    productCode: string;
    date: string;
    shift: ShiftLabel;
    values: ReadingValues;
    openingStockL: number | null;
    notes: string;
  }): Result & { reading?: TankReading } {
    if (isBlocked(input.productCode)) {
      return { ok: false, error: "该油品存在未确认处置单，已停止发油，处置确认前不能登记新班次" };
    }
    const invalid = validateValues(input.values);
    if (invalid) return { ok: false, error: invalid };

    const product = PRODUCTS.find((item) => item.code === input.productCode);
    if (!product) return { ok: false, error: "未知油品" };

    const prev = latestReading(input.productCode);
    if (prev && input.values.pumpTotalL < prev.values.pumpTotalL) {
      return { ok: false, error: "油枪累计数小于上一班，请核对油枪读数" };
    }
    if (!prev && !(input.openingStockL && input.openingStockL > 0)) {
      return { ok: false, error: "首班登记需填写开盘库存（20℃标准体积）" };
    }

    const reading = createReading({
      id: crypto.randomUUID(),
      product,
      date: input.date,
      shift: input.shift,
      values: input.values,
      openingStockL: prev ? null : input.openingStockL,
      prev: prev ? toPrevRef(prev) : null,
      notes: input.notes,
    });
    readings.value.push(reading);

    if (reading.alarms.length > 0) {
      orders.value.push({
        id: crypto.randomUUID(),
        readingId: reading.id,
        productCode: product.code,
        date: reading.date,
        shift: reading.shift,
        triggers: reading.alarms,
        status: "待处置",
        createdAt: new Date().toISOString(),
        pumpBackL: null,
        retest: null,
        confirmer: null,
        confirmedAt: null,
        note: "",
      });
    }
    persist();
    return { ok: true, reading };
  }

  /** 复核后班次冻结 */
  function reviewReading(id: string, reviewer: string): Result {
    const reading = readingById(id);
    if (!reading) return { ok: false, error: "记录不存在" };
    if (reading.reviewStatus === "已复核") return { ok: false, error: "该班次已复核冻结" };
    if (!reviewer.trim()) return { ok: false, error: "请填写复核人" };
    reading.reviewStatus = "已复核";
    reading.reviewer = reviewer.trim();
    reading.reviewedAt = new Date().toISOString();
    persist();
    return { ok: true };
  }

  /** 已复核班次的补充更正：旧值另存版本，记录本身重算判定 */
  function correctReading(
    id: string,
    values: ReadingValues,
    reason: string,
    operator: string
  ): Result {
    const reading = readingById(id);
    if (!reading) return { ok: false, error: "记录不存在" };
    if (reading.reviewStatus !== "已复核") {
      return { ok: false, error: "仅已复核冻结的班次需要更正，待复核记录可删除后重录" };
    }
    if (!reason.trim()) return { ok: false, error: "请填写更正原因" };
    if (!operator.trim()) return { ok: false, error: "请填写操作人" };
    const invalid = validateValues(values);
    if (invalid) return { ok: false, error: invalid };

    const product = PRODUCTS.find((item) => item.code === reading.productCode);
    if (!product) return { ok: false, error: "未知油品" };

    const chain = readingsOf(reading.productCode);
    const index = chain.findIndex((item) => item.id === id);
    const prev = index > 0 ? chain[index - 1] : null;
    if (prev && values.pumpTotalL < prev.values.pumpTotalL) {
      return { ok: false, error: "油枪累计数小于上一班，请核对油枪读数" };
    }

    versions.value.push({
      id: crypto.randomUUID(),
      readingId: reading.id,
      productCode: reading.productCode,
      version: reading.version,
      snapshot: { ...reading.values },
      derived: { ...reading.derived },
      reason: reason.trim(),
      operator: operator.trim(),
      createdAt: new Date().toISOString(),
    });

    reading.values = { ...values };
    reading.derived = deriveReading(
      product,
      reading.values,
      prev ? toPrevRef(prev) : null,
      reading.openingStockL
    );
    reading.alarms = evaluateReading(reading.values, reading.derived);
    reading.version += 1;

    const openOrder = orders.value.find(
      (order) => order.readingId === reading.id && order.status === "待处置"
    );
    if (reading.alarms.length > 0) {
      reading.releaseStatus = "停发";
      if (!openOrder) {
        orders.value.push({
          id: crypto.randomUUID(),
          readingId: reading.id,
          productCode: reading.productCode,
          date: reading.date,
          shift: reading.shift,
          triggers: reading.alarms,
          status: "待处置",
          createdAt: new Date().toISOString(),
          pumpBackL: null,
          retest: null,
          confirmer: null,
          confirmedAt: null,
          note: "更正后触发停发",
        });
      }
    } else {
      reading.releaseStatus = openOrder ? "停发" : "正常";
    }
    persist();
    return { ok: true };
  }

  /** 处置确认：登记抽水回罐量、复测值与复核人后恢复发油 */
  function confirmOrder(
    id: string,
    input: { pumpBackL: number; retest: RetestValues; confirmer: string; note: string }
  ): Result {
    const order = orders.value.find((item) => item.id === id);
    if (!order) return { ok: false, error: "处置单不存在" };
    if (order.status === "已恢复") return { ok: false, error: "处置单已确认" };
    if (!Number.isFinite(input.pumpBackL) || input.pumpBackL < 0) {
      return { ok: false, error: "请填写抽水回罐量（L）" };
    }
    const retestNums = [input.retest.levelMm, input.retest.waterMm, input.retest.temperatureC];
    if (retestNums.some((n) => !Number.isFinite(n))) {
      return { ok: false, error: "请完整填写复测液位、水高和温度" };
    }
    if (!canRestore(input.retest.waterMm)) {
      return { ok: false, error: "复测水高仍超过 5cm 限值，不能恢复发油" };
    }
    if (!input.confirmer.trim()) return { ok: false, error: "请填写复核人" };

    order.status = "已恢复";
    order.pumpBackL = input.pumpBackL;
    order.retest = { ...input.retest };
    order.confirmer = input.confirmer.trim();
    order.confirmedAt = new Date().toISOString();
    order.note = input.note.trim();

    const reading = readingById(order.readingId);
    if (reading) reading.releaseStatus = "正常";
    persist();
    return { ok: true };
  }

  /** 仅待复核且未关联处置单的记录可删除 */
  function removeReading(id: string): Result {
    const reading = readingById(id);
    if (!reading) return { ok: false, error: "记录不存在" };
    if (reading.reviewStatus === "已复核") {
      return { ok: false, error: "已复核班次已冻结，不能删除，请使用更正" };
    }
    if (orders.value.some((order) => order.readingId === id)) {
      return { ok: false, error: "该记录已关联处置单，不能删除" };
    }
    readings.value = readings.value.filter((item) => item.id !== id);
    persist();
    return { ok: true };
  }

  return {
    readings,
    orders,
    versions,
    readingsOf,
    latestReading,
    readingById,
    openOrderFor,
    isBlocked,
    sortedReadings,
    productSummaries,
    activeCount,
    blockedCount,
    openOrderCount,
    reviewedCount,
    registerReading,
    reviewReading,
    correctReading,
    confirmOrder,
    removeReading,
  };
});
