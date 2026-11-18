export {};

process.env.SIM_GAMES ??= "20";
process.env.SIM_PLAYERS ??= "2";
await import("./simulate");
