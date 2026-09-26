import type { FuelProduct, ShiftLabel } from "./types";

export const PRODUCTS: FuelProduct[] = [
  { code: "92", name: "92# 汽油", tankNo: "1号罐", literPerMm: 21.5, beta: 0.0012, density20: 0.725 },
  { code: "95", name: "95# 汽油", tankNo: "2号罐", literPerMm: 21.5, beta: 0.0012, density20: 0.735 },
  { code: "0", name: "0# 柴油", tankNo: "3号罐", literPerMm: 26.0, beta: 0.0008, density20: 0.835 },
];

export const SHIFTS: ShiftLabel[] = ["早班", "中班", "晚班"];

export function productOf(code: string): FuelProduct {
  return PRODUCTS.find((product) => product.code === code) ?? PRODUCTS[0];
}
