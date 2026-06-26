export const isDemo = false;

export type AppRuntimeMode = "demo" | "ble-sqlite";

export const appRuntimeMode: AppRuntimeMode = isDemo ? "demo" : "ble-sqlite";
