import { PRODUCTS } from "../domain/catalog";
import { createReading, deriveReading, toPrevRef } from "../domain/rules";
import type {
  CorrectionVersion,
  DisposalOrder,
  ReadingValues,
  TankReading,
} from "../domain/types";

export const STORAGE_KEY = "dfwlfront-7-release-desk";

export interface PersistedState {
  readings: TankReading[];
  orders: DisposalOrder[];
  versions: CorrectionVersion[];
}

export function loadState(): PersistedState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedState();
  try {
    const parsed = JSON.parse(raw) as PersistedState;
    if (
      !Array.isArray(parsed.readings) ||
      !Array.isArray(parsed.orders) ||
      !Array.isArray(parsed.versions)
    ) {
      return seedState();
    }
    return parsed;
  } catch {
    return seedState();
  }
}

export function saveState(state: PersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** 演示种子：覆盖正常放行、停发待处置、已复核冻结与更正版本四种情形 */
function seedState(): PersistedState {
  const [gasoline92, gasoline95, diesel0] = PRODUCTS;
  const date = "2026-09-25";

  const r1 = createReading({
    id: "seed-r1",
    product: gasoline92,
    date,
    shift: "早班",
    values: { levelMm: 1010, waterMm: 10, temperatureC: 21, pumpTotalL: 88340 },
    openingStockL: 21456,
    prev: null,
    reviewStatus: "已复核",
    reviewer: "王站长",
    reviewedAt: "2026-09-25T07:05:00.000Z",
    notes: "首班登记，已核开盘库存",
    createdAt: "2026-09-25T06:50:00.000Z",
  });

  const r2 = createReading({
    id: "seed-r2",
    product: gasoline92,
    date,
    shift: "中班",
    values: { levelMm: 860, waterMm: 62, temperatureC: 22, pumpTotalL: 92500 },
    openingStockL: null,
    prev: toPrevRef(r1),
    notes: "罐底积水明显，暂停发油待处置",
    createdAt: "2026-09-25T14:55:00.000Z",
  });

  const r3 = createReading({
    id: "seed-r3",
    product: gasoline95,
    date,
    shift: "早班",
    values: { levelMm: 840, waterMm: 8, temperatureC: 20, pumpTotalL: 45210 },
    openingStockL: 17888,
    prev: null,
    reviewStatus: "已复核",
    reviewer: "王站长",
    reviewedAt: "2026-09-25T07:10:00.000Z",
    notes: "账实一致",
    createdAt: "2026-09-25T06:55:00.000Z",
  });

  const r4 = createReading({
    id: "seed-r4",
    product: gasoline95,
    date,
    shift: "中班",
    values: { levelMm: 702, waterMm: 8, temperatureC: 21, pumpTotalL: 48210 },
    openingStockL: null,
    prev: toPrevRef(r3),
    reviewStatus: "已复核",
    reviewer: "王站长",
    reviewedAt: "2026-09-25T15:05:00.000Z",
    notes: "与油枪核对无误",
    createdAt: "2026-09-25T14:50:00.000Z",
    version: 2,
  });

  const r5 = createReading({
    id: "seed-r5",
    product: diesel0,
    date,
    shift: "早班",
    values: { levelMm: 720, waterMm: 12, temperatureC: 25, pumpTotalL: 15800 },
    openingStockL: 18392,
    prev: null,
    reviewStatus: "已复核",
    reviewer: "王站长",
    reviewedAt: "2026-09-25T07:20:00.000Z",
    notes: "账实一致",
    createdAt: "2026-09-25T07:00:00.000Z",
  });

  const order: DisposalOrder = {
    id: "seed-o1",
    readingId: r2.id,
    productCode: r2.productCode,
    date: r2.date,
    shift: r2.shift,
    triggers: r2.alarms,
    status: "待处置",
    createdAt: "2026-09-25T14:55:00.000Z",
    pumpBackL: null,
    retest: null,
    confirmer: null,
    confirmedAt: null,
    note: "夜班交接前完成抽水并复测",
  };

  const oldValues: ReadingValues = { levelMm: 700, waterMm: 8, temperatureC: 21, pumpTotalL: 48210 };
  const version: CorrectionVersion = {
    id: "seed-v1",
    readingId: r4.id,
    productCode: r4.productCode,
    version: 1,
    snapshot: oldValues,
    derived: deriveReading(gasoline95, oldValues, toPrevRef(r3), null),
    reason: "液位读数误读，经复测由 700mm 更正为 702mm",
    operator: "李班长",
    createdAt: "2026-09-25T15:20:00.000Z",
  };

  return { readings: [r1, r2, r3, r4, r5], orders: [order], versions: [version] };
}
