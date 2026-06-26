import { BleSqliteDailySipSource } from "./bleSqliteDailySipSource";
import type { DailySipDataSource } from "./types";

export const createDailySipDataSource = (): DailySipDataSource => {
  return new BleSqliteDailySipSource();
};
