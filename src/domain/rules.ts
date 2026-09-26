import type {
  DisposalOrder,
  EntryValues,
  FuelProduct,
  Remeasure,
  ShiftEntry,
  TankConfig,
  Verdict,
} from "./types";

/** 水高停发限值（cm） */
export const WATER_LIMIT_CM = 5;
/** 库存差异停发限值（%） */
export const DIFF_LIMIT_PCT = 0.8;
/** 标准换算温度（°C） */
export const STANDARD_TEMP_C = 20;

/** 卧式圆罐在指定液位下的容积（L），按圆弓形截面积 × 罐长计算 */
export function tankVolumeLiters(levelMm: number, tank: TankConfig): number {
  const r = tank.diameterMm / 2;
  const h = Math.min(Math.max(levelMm, 0), tank.diameterMm);
  if (h <= 0) return 0;
  const segment =
    r * r * Math.acos((r - h) / r) - (r - h) * Math.sqrt(Math.max(0, 2 * r * h - h * h));
  return (segment * tank.lengthMm) / 1_000_000;
}

/** 扣除罐底积水后的净油体积（L） */
export function netFuelLiters(levelMm: number, waterCm: number, tank: TankConfig): number {
  const total = tankVolumeLiters(levelMm, tank);
  const water = tankVolumeLiters(waterCm * 10, tank);
  return Math.max(0, total - water);
}

/** 按体积温度系数把体积换算到 20°C 标准体积 */
export function toV20(liters: number, tempC: number, beta: number): number {
  return liters * (1 - beta * (tempC - STANDARD_TEMP_C));
}

/** 与上一班衔接的基线：取自上一班实测库存（或其已确认处置的复测值） */
export interface Baseline {
  entryId: string | null;
  measuredLiters: number;
  v20Measured: number;
  nozzleTotal: number;
}

/** 交接判定：计算实测/账面库存与差异率，并给出停发触发原因 */
export function evaluateEntry(
  values: EntryValues,
  fuel: FuelProduct,
  baseline: Baseline | null
): Verdict {
  const measuredLiters = netFuelLiters(values.levelMm, values.waterCm, fuel.tank);
  const v20Measured = toV20(measuredLiters, values.tempC, fuel.beta);
  const salesLiters = baseline ? values.nozzleTotal - baseline.nozzleTotal : 0;
  const bookLiters = baseline ? baseline.measuredLiters - salesLiters : measuredLiters;
  const v20Book = baseline
    ? baseline.v20Measured - toV20(salesLiters, values.tempC, fuel.beta)
    : v20Measured;
  const diffPct =
    baseline && v20Book !== 0 ? ((v20Measured - v20Book) / Math.abs(v20Book)) * 100 : 0;

  const triggers: string[] = [];
  if (values.waterCm > WATER_LIMIT_CM) {
    triggers.push(`水高 ${values.waterCm}cm 超过 ${WATER_LIMIT_CM}cm 限值`);
  }
  if (baseline && Math.abs(diffPct) > DIFF_LIMIT_PCT) {
    triggers.push(`库存差异 ${diffPct.toFixed(2)}% 超出 ±${DIFF_LIMIT_PCT}% 限值`);
  }

  return {
    measuredLiters,
    v20Measured,
    salesLiters,
    bookLiters,
    v20Book,
    diffPct,
    triggers,
    baselineEntryId: baseline?.entryId ?? null,
  };
}

/** 处置单确认前的校验，返回问题清单（空数组 = 可以确认恢复） */
export function disposalProblems(order: DisposalOrder): string[] {
  const problems: string[] = [];
  const waterTriggered = order.triggers.some((t) => t.includes("水高"));

  if (order.pumpedLiters === null || Number.isNaN(order.pumpedLiters)) {
    problems.push("请登记抽水回罐量");
  } else if (order.pumpedLiters < 0) {
    problems.push("抽水回罐量不能为负数");
  } else if (waterTriggered && order.pumpedLiters === 0) {
    problems.push("因水高超限停发，抽水回罐量须大于 0");
  }

  if (!order.remeasure) {
    problems.push("请登记复测值（液位 / 水高 / 温度）");
  } else if (order.remeasure.waterCm > WATER_LIMIT_CM) {
    problems.push(`复测水高 ${order.remeasure.waterCm}cm 仍超过 ${WATER_LIMIT_CM}cm，不能恢复发油`);
  }

  if (!order.reviewer.trim()) {
    problems.push("请填写复核人");
  }
  return problems;
}

/**
 * 还原某油品当前的衔接基线：
 * 若最新班次关联的处置单已确认且登记了复测值，则以复测值为准，否则用该班次的实测库存。
 */
export function baselineFromEntry(
  entry: ShiftEntry,
  disposal: DisposalOrder | undefined,
  fuel: FuelProduct
): Baseline {
  if (disposal && disposal.status === "已确认" && disposal.remeasure) {
    const remeasure: Remeasure = disposal.remeasure;
    const measured = netFuelLiters(remeasure.levelMm, remeasure.waterCm, fuel.tank);
    return {
      entryId: entry.id,
      measuredLiters: measured,
      v20Measured: toV20(measured, remeasure.tempC, fuel.beta),
      nozzleTotal: entry.values.nozzleTotal,
    };
  }
  return {
    entryId: entry.id,
    measuredLiters: entry.verdict.measuredLiters,
    v20Measured: entry.verdict.v20Measured,
    nozzleTotal: entry.values.nozzleTotal,
  };
}
