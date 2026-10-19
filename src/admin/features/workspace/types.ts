import { z } from "zod";
import {
  adminChatMessageSchema,
  adminChatToolCallSchema,
  adminChatToolResultSchema,
} from "../../types";

export const workspacePageImageSchema = z
  .object({
    fileName: z.string().trim().min(1).max(500),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    /** Data stays in IndexedDB on this device; it is never added to a knowledge snapshot. */
    dataUrl: z.string().startsWith("data:image/").max(2_900_000),
  })
  .strict();
export type WorkspacePageImage = z.infer<typeof workspacePageImageSchema>;

export const workspaceToolLogSchema = z
  .object({
    id: z.string().trim().min(8).max(160),
    createdAt: z.string().datetime(),
    call: adminChatToolCallSchema,
    result: adminChatToolResultSchema,
  })
  .strict();
export type WorkspaceToolLog = z.infer<typeof workspaceToolLogSchema>;

export const workspaceSessionSchema = z
  .object({
    id: z.string().trim().min(8).max(160),
    title: z.string().trim().min(1).max(180),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    sourceName: z.string().trim().max(500).optional(),
    page: z.number().int().min(1).max(20_000).optional(),
    pageText: z.string().trim().max(24_000).optional(),
    pageImage: workspacePageImageSchema.optional(),
    selectedItemId: z.string().trim().min(8).max(160).optional(),
    messages: z.array(adminChatMessageSchema).max(80).default([]),
    toolLog: z.array(workspaceToolLogSchema).max(100).default([]),
    clarificationRounds: z.number().int().min(0).max(3).default(0),
    waitingForClarification: z.boolean().default(false),
    /** Generic safety warnings only; never OCR text or a hidden prompt. */
    safetyWarnings: z.array(z.string().trim().min(1).max(1_000)).max(30).default([]),
  })
  .strict();
export type WorkspaceSession = z.infer<typeof workspaceSessionSchema>;
