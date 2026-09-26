export type ShiftLabel = "早班" | "中班" | "晚班";

export type ReviewStatus = "待复核" | "已复核";

export type ReleaseStatus = "正常" | "停发";

export type OrderStatus = "待处置" | "已恢复";

/** 油品与罐的静态配置 */
export interface FuelProduct {
  code: string;
  name: string;
  tankNo: string;
  /** 容积表系数：每毫米液位对应升数 */
  literPerMm: number;
  /** 体积温度系数 β（1/℃） */
  beta: number;
  /** 标准密度 ρ20（kg/L） */
  density20: number;
}

/** 交接时登记的实测值 */
export interface ReadingValues {
  levelMm: number;
  waterMm: number;
  temperatureC: number;
  pumpTotalL: number;
}

/** 由实测值换算出的派生量 */
export interface ReadingDerived {
  oilHeightMm: number;
  volumeL: number;
  vcf: number;
  standardVolumeL: number;
  standardMassKg: number;
  pumpDeltaL: number;
  bookStockL: number;
  diffL: number;
  diffPct: number;
}

export interface Alarm {
  code: "WATER" | "DIFF";
  message: string;
}

/** 一条班次罐检记录 */
export interface TankReading {
  id: string;
  productCode: string;
  date: string;
  shift: ShiftLabel;
  values: ReadingValues;
  /** 首班无上一班衔接时登记的开盘库存（20℃标准体积） */
  openingStockL: number | null;
  derived: ReadingDerived;
  alarms: Alarm[];
  releaseStatus: ReleaseStatus;
  reviewStatus: ReviewStatus;
  reviewer: string | null;
  reviewedAt: string | null;
  notes: string;
  createdAt: string;
  /** 当前版本号，更正一次 +1 */
  version: number;
}

/** 已复核班次的更正版本：旧值快照另存，原记录保留 */
export interface CorrectionVersion {
  id: string;
  readingId: string;
  productCode: string;
  /** 被冻结的旧版本号 */
  version: number;
  snapshot: ReadingValues;
  derived: ReadingDerived;
  reason: string;
  operator: string;
  createdAt: string;
}

/** 处置单上的复测值 */
export interface RetestValues {
  levelMm: number;
  waterMm: number;
  temperatureC: number;
}

/** 停发后生成的处置单 */
export interface DisposalOrder {
  id: string;
  readingId: string;
  productCode: string;
  date: string;
  shift: ShiftLabel;
  triggers: Alarm[];
  status: OrderStatus;
  createdAt: string;
  /** 抽水回罐量 L */
  pumpBackL: number | null;
  retest: RetestValues | null;
  /** 复核人 */
  confirmer: string | null;
  confirmedAt: string | null;
  note: string;
}
