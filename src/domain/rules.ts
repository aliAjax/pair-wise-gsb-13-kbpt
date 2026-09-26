import type {
  Alarm,
  FuelProduct,
  ReadingDerived,
  ReadingValues,
  ReviewStatus,
  ShiftLabel,
  TankReading,
} from "./types";

/** 水高限值：5cm */
export const WATER_LIMIT_MM = 50;
/** 温度密度换算后库存差异限值 */
export const DIFF_LIMIT_PCT = 0.8;

/** 上一班衔接所需的最小信息 */
export interface PrevReadingRef {
  pumpTotalL: number;
  standardVolumeL: number;
}

export function toPrevRef(reading: TankReading): PrevReadingRef {
  return {
    pumpTotalL: reading.values.pumpTotalL,
    standardVolumeL: reading.derived.standardVolumeL,
  };
}

/** 体积修正系数 VCF = 1 - β × (t - 20) */
export function vcfFor(product: FuelProduct, temperatureC: number): number {
  return 1 - product.beta * (temperatureC - 20);
}

/**
 * 温度密度换算与库存衔接：
 * 净油高 = 液位 - 水高；表载体积按罐容系数折算；
 * 标准体积 V20 = 表载体积 × VCF；账面库存 = 上一班实测标准库存 - 本班油枪付油量。
 */
export function deriveReading(
  product: FuelProduct,
  values: ReadingValues,
  prev: PrevReadingRef | null,
  openingStockL: number | null
): ReadingDerived {
  const oilHeightMm = Math.max(0, values.levelMm - values.waterMm);
  const volumeL = oilHeightMm * product.literPerMm;
  const vcf = vcfFor(product, values.temperatureC);
  const standardVolumeL = volumeL * vcf;
  const standardMassKg = standardVolumeL * product.density20;
  const pumpDeltaL = prev ? Math.max(0, values.pumpTotalL - prev.pumpTotalL) : 0;
  const bookStockL = prev
    ? prev.standardVolumeL - pumpDeltaL
    : openingStockL ?? standardVolumeL;
  const diffL = standardVolumeL - bookStockL;
  const diffPct = bookStockL > 0 ? (diffL / bookStockL) * 100 : 0;
  return {
    oilHeightMm,
    volumeL,
    vcf,
    standardVolumeL,
    standardMassKg,
    pumpDeltaL,
    bookStockL,
    diffL,
    diffPct,
  };
}

/** 放行判定：水高超 5cm 或换算后库存差异超 ±0.8% 即触发停发 */
export function evaluateReading(values: ReadingValues, derived: ReadingDerived): Alarm[] {
  const alarms: Alarm[] = [];
  if (values.waterMm > WATER_LIMIT_MM) {
    alarms.push({
      code: "WATER",
      message: `水高 ${values.waterMm}mm 超过 ${WATER_LIMIT_MM}mm（5cm）限值`,
    });
  }
  if (Math.abs(derived.diffPct) > DIFF_LIMIT_PCT) {
    alarms.push({
      code: "DIFF",
      message: `库存差异 ${derived.diffPct.toFixed(2)}% 超过 ±${DIFF_LIMIT_PCT}% 限值`,
    });
  }
  return alarms;
}

export function validateValues(values: ReadingValues): string | null {
  const nums = [values.levelMm, values.waterMm, values.temperatureC, values.pumpTotalL];
  if (nums.some((n) => !Number.isFinite(n))) return "请完整填写液位、水高、温度和油枪累计数";
  if (values.levelMm <= 0) return "液位必须大于 0";
  if (values.waterMm < 0) return "水高不能为负";
  if (values.waterMm >= values.levelMm) return "水高不能超过液位";
  if (values.temperatureC < -30 || values.temperatureC > 50) return "温度需在 -30~50℃ 之间";
  if (values.pumpTotalL < 0) return "油枪累计数不能为负";
  return null;
}

/** 处置确认门槛：复测水高回到限值内才允许恢复发油 */
export function canRestore(waterMm: number): boolean {
  return Number.isFinite(waterMm) && waterMm >= 0 && waterMm <= WATER_LIMIT_MM;
}

export function createReading(input: {
  id: string;
  product: FuelProduct;
  date: string;
  shift: ShiftLabel;
  values: ReadingValues;
  openingStockL: number | null;
  prev: PrevReadingRef | null;
  reviewStatus?: ReviewStatus;
  reviewer?: string | null;
  reviewedAt?: string | null;
  notes?: string;
  createdAt?: string;
  version?: number;
}): TankReading {
  const derived = deriveReading(input.product, input.values, input.prev, input.openingStockL);
  const alarms = evaluateReading(input.values, derived);
  return {
    id: input.id,
    productCode: input.product.code,
    date: input.date,
    shift: input.shift,
    values: input.values,
    openingStockL: input.openingStockL,
    derived,
    alarms,
    releaseStatus: alarms.length > 0 ? "停发" : "正常",
    reviewStatus: input.reviewStatus ?? "待复核",
    reviewer: input.reviewer ?? null,
    reviewedAt: input.reviewedAt ?? null,
    notes: input.notes ?? "",
    createdAt: input.createdAt ?? new Date().toISOString(),
    version: input.version ?? 1,
  };
}
