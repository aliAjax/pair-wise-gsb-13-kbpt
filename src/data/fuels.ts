import type {
  DisposalOrder,
  EntryStatus,
  EntryValues,
  FuelProduct,
  ShiftEntry,
} from "../domain/types";
import { baselineFromEntry, evaluateEntry, netFuelLiters, type Baseline } from "../domain/rules";

/** 油品与罐号档案 */
export const FUELS: FuelProduct[] = [
  {
    code: "92",
    name: "92#汽油",
    beta: 0.0012,
    tank: { tankNo: "T-01", diameterMm: 2600, lengthMm: 8800 },
  },
  {
    code: "95",
    name: "95#汽油",
    beta: 0.0012,
    tank: { tankNo: "T-02", diameterMm: 2600, lengthMm: 8800 },
  },
  {
    code: "0",
    name: "0#柴油",
    beta: 0.0008,
    tank: { tankNo: "T-03", diameterMm: 2800, lengthMm: 9600 },
  },
];

export const SHIFTS = ["早班", "中班", "晚班"] as const;

export function fuelByCode(code: string): FuelProduct {
  const fuel = FUELS.find((item) => item.code === code);
  if (!fuel) throw new Error(`未知油品: ${code}`);
  return fuel;
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function dateDaysAgo(days: number): string {
  return isoHoursAgo(days * 24).slice(0, 10);
}

/**
 * 演示种子数据：按时间顺序逐班登记，库存衔接与停发判定全部走规则层计算，
 * 保证差异率、处置单与真实录入路径一致。
 */
export function buildSeed(): { entries: ShiftEntry[]; disposals: DisposalOrder[] } {
  const entries: ShiftEntry[] = [];
  const disposals: DisposalOrder[] = [];
  let seq = 0;

  function latestOf(fuelCode: string): ShiftEntry | undefined {
    const list = entries.filter((entry) => entry.fuelCode === fuelCode);
    return list[list.length - 1];
  }

  function baselineOf(fuelCode: string): Baseline | null {
    const latest = latestOf(fuelCode);
    if (!latest) return null;
    const disposal = disposals.find((order) => order.entryId === latest.id);
    return baselineFromEntry(latest, disposal, fuelByCode(fuelCode));
  }

  function add(
    fuelCode: string,
    values: EntryValues,
    status: EntryStatus,
    createdAt: string
  ): ShiftEntry {
    const verdict = evaluateEntry(values, fuelByCode(fuelCode), baselineOf(fuelCode));
    seq += 1;
    const entry: ShiftEntry = {
      id: `seed-e${seq}`,
      fuelCode,
      status,
      values,
      verdict,
      version: 1,
      versions: [],
      createdAt,
    };
    entries.push(entry);
    if (verdict.triggers.length > 0) {
      disposals.push({
        id: `seed-d${seq}`,
        fuelCode,
        entryId: entry.id,
        triggers: [...verdict.triggers],
        status: "待处置",
        createdAt,
        pumpedLiters: null,
        remeasure: null,
        reviewer: "",
        confirmedAt: null,
        note: "",
      });
    }
    return entry;
  }

  /** 按目标液位反推油枪累计数，使账面库存与上一班实测衔接 */
  function nozzleFor(fuelCode: string, levelMm: number, waterCm: number, startTotal: number): number {
    const baseline = baselineOf(fuelCode);
    if (!baseline) return startTotal;
    const measured = netFuelLiters(levelMm, waterCm, fuelByCode(fuelCode).tank);
    return Math.round(baseline.nozzleTotal + (baseline.measuredLiters - measured));
  }

  // 95#汽油：昨日晚班水高超限已处置确认，今日早班、中班正常衔接
  const night95 = add(
    "95",
    {
      businessDate: dateDaysAgo(1),
      shift: "晚班",
      levelMm: 1500,
      waterCm: 6.0,
      tempC: 17.0,
      nozzleTotal: 88750,
      operator: "王强",
      note: "量油发现罐底积水偏高",
    },
    "已复核",
    isoHoursAgo(30)
  );
  const disposal95 = disposals.find((order) => order.entryId === night95.id);
  if (disposal95) {
    disposal95.status = "已确认";
    disposal95.pumpedLiters = 42;
    disposal95.remeasure = { levelMm: 1496, waterCm: 1.6, tempC: 17.2 };
    disposal95.reviewer = "李敏";
    disposal95.confirmedAt = isoHoursAgo(29);
    disposal95.note = "罐底抽水回罐 42L，复测水高合格，恢复发油";
  }
  add(
    "95",
    {
      businessDate: dateDaysAgo(0),
      shift: "早班",
      levelMm: 1310,
      waterCm: 1.7,
      tempC: 18.4,
      nozzleTotal: nozzleFor("95", 1310, 1.7, 0),
      operator: "赵倩",
      note: "衔接昨日处置复测值，账实一致",
    },
    "已复核",
    isoHoursAgo(16)
  );
  add(
    "95",
    {
      businessDate: dateDaysAgo(0),
      shift: "中班",
      levelMm: 1150,
      waterCm: 1.8,
      tempC: 19.1,
      nozzleTotal: nozzleFor("95", 1150, 1.8, 0),
      operator: "王强",
      note: "等待站长复核",
    },
    "待复核",
    isoHoursAgo(8)
  );

  // 92#汽油：早班登记后做过一次补充更正（液位 1610 → 1620），中班正常
  const morning92 = add(
    "92",
    {
      businessDate: dateDaysAgo(0),
      shift: "早班",
      levelMm: 1610,
      waterCm: 2.1,
      tempC: 18.5,
      nozzleTotal: 102340,
      operator: "王强",
      note: "",
    },
    "已复核",
    isoHoursAgo(15)
  );
  const corrected92: EntryValues = { ...morning92.values, levelMm: 1620, note: "液位复量后更正" };
  morning92.versions.push({
    version: 1,
    reason: "交班液位读数有误，复量后更正",
    changedBy: "李敏",
    changedAt: isoHoursAgo(14),
    snapshot: {
      values: { ...morning92.values },
      verdict: { ...morning92.verdict, triggers: [...morning92.verdict.triggers] },
    },
  });
  morning92.version = 2;
  morning92.values = corrected92;
  morning92.verdict = evaluateEntry(corrected92, fuelByCode("92"), null);
  add(
    "92",
    {
      businessDate: dateDaysAgo(0),
      shift: "中班",
      levelMm: 1385,
      waterCm: 2.2,
      tempC: 19.0,
      nozzleTotal: nozzleFor("92", 1385, 2.2, 0),
      operator: "赵倩",
      note: "账实一致",
    },
    "已复核",
    isoHoursAgo(7)
  );

  // 0#柴油：中班水高 6.3cm 触发停发，处置单待确认
  add(
    "0",
    {
      businessDate: dateDaysAgo(0),
      shift: "早班",
      levelMm: 1750,
      waterCm: 1.9,
      tempC: 18.2,
      nozzleTotal: 65400,
      operator: "赵倩",
      note: "账实一致",
    },
    "已复核",
    isoHoursAgo(13)
  );
  add(
    "0",
    {
      businessDate: dateDaysAgo(0),
      shift: "中班",
      levelMm: 1490,
      waterCm: 6.3,
      tempC: 18.8,
      nozzleTotal: nozzleFor("0", 1490, 6.3, 0),
      operator: "王强",
      note: "量油尺带水明显，等待处置",
    },
    "待复核",
    isoHoursAgo(2)
  );

  return { entries, disposals };
}
