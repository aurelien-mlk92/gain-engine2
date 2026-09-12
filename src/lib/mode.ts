export type Mode = "PAPER" | "LIVE";

export function getMode(): Mode {
  return process.env.MODE === "LIVE" ? "LIVE" : "PAPER";
}
