/** 油罐配置（卧式圆罐，用于液位-容积换算） */
export interface TankConfig {
  tankNo: string;
  diameterMm: number;
  lengthMm: number;
}

/** 油品档案：一个油品对应一个罐 */
export interface FuelProduct {
  code: string;
  name: string;
  /** 体积温度系数（/°C），用于把实测体积换算到 20°C 标准体积 */
  beta: number;
  tank: TankConfig;
}

export type ShiftName = "早班" | "中班" | "晚班";
export type EntryStatus = "待复核" | "已复核";
export type DisposalStatus = "待处置" | "已确认";

/** 交接登记的手工录入值 */
export interface EntryValues {
  businessDate: string;
  shift: ShiftName;
  levelMm: number;
  waterCm: number;
  tempC: number;
  nozzleTotal: number;
  operator: string;
  note: string;
}

/** 判定结果：由规则层计算并随记录保存 */
export interface Verdict {
  measuredLiters: number;
  v20Measured: number;
  salesLiters: number;
  bookLiters: number;
  v20Book: number;
  diffPct: number;
  /** 触发停发的原因，空数组表示正常放行 */
  triggers: string[];
  /** 衔接的上一班记录 id，首班建账为 null */
  baselineEntryId: string | null;
}

/** 冻结班次的补充更正：旧值整体留档为一个版本 */
export interface EntryVersion {
  version: number;
  reason: string;
  changedBy: string;
  changedAt: string;
  snapshot: {
    values: EntryValues;
    verdict: Verdict;
  };
}

export interface ShiftEntry {
  id: string;
  fuelCode: string;
  status: EntryStatus;
  values: EntryValues;
  verdict: Verdict;
  version: number;
  versions: EntryVersion[];
  createdAt: string;
}

/** 处置时登记的复测值 */
export interface Remeasure {
  levelMm: number;
  waterCm: number;
  tempC: number;
}

export interface DisposalOrder {
  id: string;
  fuelCode: string;
  entryId: string;
  triggers: string[];
  status: DisposalStatus;
  createdAt: string;
  pumpedLiters: number | null;
  remeasure: Remeasure | null;
  reviewer: string;
  confirmedAt: string | null;
  note: string;
}

/** 处置确认时提交的内容 */
export interface DisposalConfirmation {
  pumpedLiters: number;
  remeasure: Remeasure;
  reviewer: string;
  note: string;
}
