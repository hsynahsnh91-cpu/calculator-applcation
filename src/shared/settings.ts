import { z } from "zod";
import { ENGINE_IDS } from "./engines";

export const engineIdSchema = z.enum(ENGINE_IDS);

export const solverSettingsSchema = z
  .object({
    disabledEngines: z.array(engineIdSchema).max(30).default([]),
    matchThreshold: z.number().finite().min(0.85).max(0.999).default(0.96),
    timeoutMs: z.number().int().min(2_000).max(60_000).default(15_000),
  })
  .strict();

export type SolverSettings = z.infer<typeof solverSettingsSchema>;

export const defaultSolverSettings: SolverSettings = {
  disabledEngines: [],
  matchThreshold: 0.96,
  timeoutMs: 15_000,
};
