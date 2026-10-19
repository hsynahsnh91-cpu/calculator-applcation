/** The thirteen local engines. Keep this list identical to src/solver/types.ts. */
export const ENGINE_IDS = [
  "mathEngine",
  "equationSolver",
  "sequences",
  "calculusEngine",
  "limitsEngine",
  "integrationEngine",
  "geometryEngine",
  "geometryTools",
  "matricesEngine",
  "probabilityEngine",
  "probabilityTools",
  "complexEngine",
  "complexTools",
] as const;

export type EngineId = (typeof ENGINE_IDS)[number];
