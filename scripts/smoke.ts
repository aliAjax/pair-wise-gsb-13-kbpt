// 规则与数据层冒烟测试（node 环境，由 esbuild 打包后运行）
const memStore = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => memStore.get(key) ?? null,
  setItem: (key: string, value: string) => void memStore.set(key, value),
  removeItem: (key: string) => void memStore.delete(key),
  clear: () => void memStore.clear(),
  key: () => null,
  length: 0,
} as Storage;

import assert from "node:assert";
import { createPinia, setActivePinia } from "pinia";
import { PRODUCTS } from "../src/domain/catalog";
import { DIFF_LIMIT_PCT, deriveReading, evaluateReading, WATER_LIMIT_MM } from "../src/domain/rules";
import { useReleaseDeskStore } from "../src/stores/releaseDesk";

setActivePinia(createPinia());
const store = useReleaseDeskStore();
const [p92, p95] = PRODUCTS;

// 1. 种子：92# 中班 水高62mm + 差异>0.8% → 停发并有待处置单
const r2 = store.readings.find((r) => r.id === "seed-r2")!;
assert.strictEqual(r2.releaseStatus, "停发");
assert.deepStrictEqual(r2.alarms.map((a) => a.code), ["WATER", "DIFF"]);
assert.strictEqual(store.isBlocked("92"), true);

// 2. 种子：正常班次不报警；95# 更正版本保留旧值
const r1 = store.readings.find((r) => r.id === "seed-r1")!;
assert.strictEqual(r1.alarms.length, 0);
assert.strictEqual(r1.releaseStatus, "正常");
const r4 = store.readings.find((r) => r.id === "seed-r4")!;
assert.strictEqual(r4.version, 2);
const v1 = store.versions.find((v) => v.id === "seed-v1")!;
assert.strictEqual(v1.snapshot.levelMm, 700);
assert.strictEqual(v1.version, 1);

// 3. 未确认停发前不能登记新班次
const blocked = store.registerReading({
  productCode: "92", date: "2026-09-26", shift: "晚班",
  values: { levelMm: 900, waterMm: 0, temperatureC: 20, pumpTotalL: 93000 },
  openingStockL: null, notes: "",
});
assert.strictEqual(blocked.ok, false);

// 4. 处置确认（抽水回罐+复测水高合格+复核人）后恢复，可继续登记
const order = store.orders.find((o) => o.id === "seed-o1")!;
assert.strictEqual(
  store.confirmOrder(order.id, {
    pumpBackL: 28,
    retest: { levelMm: 858, waterMm: 12, temperatureC: 21 },
    confirmer: "赵班长", note: "抽水后复测合格",
  }).ok,
  true
);
assert.strictEqual(store.isBlocked("92"), false);
const next = store.registerReading({
  productCode: "92", date: "2026-09-26", shift: "晚班",
  values: { levelMm: 880, waterMm: 12, temperatureC: 20, pumpTotalL: 94100 },
  openingStockL: null, notes: "恢复后首班",
});
assert.strictEqual(next.ok, true);

// 5. 复测水高仍 >50 不允许恢复（用新触发的处置单验证）
const bad = store.registerReading({
  productCode: "95", date: "2026-09-26", shift: "晚班",
  values: { levelMm: 600, waterMm: 55, temperatureC: 20, pumpTotalL: 49810 },
  openingStockL: null, notes: "",
});
assert.strictEqual(bad.ok, true);
assert.strictEqual(bad.reading!.releaseStatus, "停发");
const o95 = store.openOrderFor("95")!;
assert.strictEqual(
  store.confirmOrder(o95.id, {
    pumpBackL: 0,
    retest: { levelMm: 600, waterMm: 52, temperatureC: 20 },
    confirmer: "赵班长", note: "",
  }).ok,
  false
);

// 6. 已复核冻结记录不能直接改，走更正 → 旧值另存、版本+1
const before = store.versions.length;
const corr = store.correctReading(
  "seed-r5",
  { levelMm: 722, waterMm: 12, temperatureC: 25, pumpTotalL: 15800 },
  "液位复测更正", "孙班长"
);
assert.strictEqual(corr.ok, true);
assert.strictEqual(store.versions.length, before + 1);
assert.strictEqual(store.readings.find((r) => r.id === "seed-r5")!.version, 2);

// 7. 阈值边界：水高 50 不报、51 报；差异 0.8 不报
const normal = deriveReading(p92, { levelMm: 1000, waterMm: 50, temperatureC: 20, pumpTotalL: 0 }, null, 20425);
assert.strictEqual(evaluateReading({ levelMm: 1000, waterMm: 50, temperatureC: 20, pumpTotalL: 0 }, normal)
  .some((a) => a.code === "WATER"), false);
const tooWet = evaluateReading({ levelMm: 1000, waterMm: 51, temperatureC: 20, pumpTotalL: 0 }, normal);
assert.strictEqual(tooWet.some((a) => a.code === "WATER"), true);
assert.strictEqual(DIFF_LIMIT_PCT, 0.8);
assert.strictEqual(WATER_LIMIT_MM, 50);

// 8. 衔接计算：账面库存 = 上班V20 - 油枪增量
const chained = deriveReading(
  p92,
  { levelMm: 900, waterMm: 0, temperatureC: 20, pumpTotalL: 89340 },
  { pumpTotalL: 88340, standardVolumeL: 21474.2 },
  null
);
assert.ok(Math.abs(chained.bookStockL - 20474.2) < 1e-6);
assert.ok(Math.abs(chained.pumpDeltaL - 1000) < 1e-6);

console.log("全部冒烟用例通过 ✓");
void p95;
