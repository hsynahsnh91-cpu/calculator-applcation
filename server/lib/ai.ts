import { resolveAiProvider, type AiProviderConfig } from "./secrets.js";

export type ChatToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

export type ChatMessage = {
  content?: string | null;
  tool_calls?: ChatToolCall[];
};

interface OpenAiStyleMessage {
  role?: string;
  content?: unknown;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function parseOpenAiMessage(value: unknown): ChatMessage | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) return undefined;
  const first = value.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return undefined;
  const message = first.message;
  const content = typeof message.content === "string" ? message.content : undefined;
  const rawToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : undefined;
  const toolCalls = rawToolCalls?.filter((call): call is ChatToolCall => isRecord(call));
  return { content, ...(toolCalls ? { tool_calls: toolCalls } : {}) };
}

function parseGeminiMessage(value: unknown): ChatMessage | undefined {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return undefined;
  const first = value.candidates[0];
  if (!isRecord(first) || !isRecord(first.content) || !Array.isArray(first.content.parts))
    return undefined;
  const texts: string[] = [];
  const toolCalls: ChatToolCall[] = [];
  first.content.parts.forEach((part, index) => {
    if (!isRecord(part)) return;
    if (typeof part.text === "string" && part.text) texts.push(part.text);
    if (isRecord(part.functionCall) && typeof part.functionCall.name === "string") {
      toolCalls.push({
        id: `gemini-${index + 1}`,
        type: "function",
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args ?? {}),
        },
      });
    }
  });
  if (!texts.length && !toolCalls.length) return undefined;
  return {
    content: texts.join("\n") || undefined,
    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
  };
}

function geminiFunctionDeclarations(tools: readonly unknown[]): unknown[] {
  return tools.flatMap((tool) => {
    if (!isRecord(tool) || !isRecord(tool.function) || typeof tool.function.name !== "string")
      return [];
    const parameters = isRecord(tool.function.parameters)
      ? { ...tool.function.parameters }
      : { type: "object", properties: {} };
    delete (parameters as { additionalProperties?: unknown }).additionalProperties;
    return [
      {
        name: tool.function.name,
        description: typeof tool.function.description === "string" ? tool.function.description : "",
        parameters,
      },
    ];
  });
}

function geminiContents(messages: OpenAiStyleMessage[]): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: unknown[];
} {
  const systemParts: string[] = [];
  const contents: unknown[] = [];
  const toolNames = new Map<string, string>();
  for (const message of messages) {
    if (message.role === "system" && typeof message.content === "string") {
      systemParts.push(message.content);
      continue;
    }
    if (message.role === "user" && typeof message.content === "string") {
      contents.push({ role: "user", parts: [{ text: message.content }] });
      continue;
    }
    if (message.role === "assistant") {
      const parts: unknown[] = [];
      if (typeof message.content === "string" && message.content)
        parts.push({ text: message.content });
      for (const call of message.tool_calls ?? []) {
        if (!call.function?.name) continue;
        let args: unknown = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        if (call.id) toolNames.set(call.id, call.function.name);
        parts.push({ functionCall: { name: call.function.name, args } });
      }
      if (parts.length) contents.push({ role: "model", parts });
      continue;
    }
    if (message.role === "tool") {
      const name = (message.tool_call_id && toolNames.get(message.tool_call_id)) || "tool";
      let payload: unknown = message.content;
      if (typeof message.content === "string") {
        try {
          payload = JSON.parse(message.content);
        } catch {
          payload = { content: message.content };
        }
      }
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name, response: isRecord(payload) ? payload : { content: payload } } }],
      });
    }
  }
  return {
    ...(systemParts.length ? { systemInstruction: { parts: [{ text: systemParts.join("\n") }] } } : {}),
    contents,
  };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs));
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`رفض مزود الذكاء الطلب (${response.status}).`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function requestChatCompletion(
  messages: unknown[],
  tools: readonly unknown[],
  timeoutMs: number,
  config: AiProviderConfig = resolveAiProvider(),
): Promise<ChatMessage> {
  if (config.kind === "none" || !config.apiKey || !config.model)
    throw new Error("إعداد AI غير مكتمل.");
  if (config.kind === "gemini") {
    const converted = geminiContents(messages as OpenAiStyleMessage[]);
    const payload = {
      ...converted,
      tools: [{ functionDeclarations: geminiFunctionDeclarations(tools) }],
      generationConfig: { temperature: 0 },
    };
    const parsed = parseGeminiMessage(
      await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
        { "x-goog-api-key": config.apiKey },
        payload,
        timeoutMs,
      ),
    );
    if (!parsed) throw new Error("لم يُرجع مزود الذكاء رسالة صالحة.");
    return parsed;
  }
  const parsed = parseOpenAiMessage(
    await postJson(
      config.url || "https://api.openai.com/v1/chat/completions",
      { Authorization: `Bearer ${config.apiKey}` },
      {
        model: config.model,
        temperature: 0,
        messages,
        tools,
        tool_choice: "auto",
      },
      timeoutMs,
    ),
  );
  if (!parsed) throw new Error("لم يُرجع مزود الذكاء رسالة صالحة.");
  return parsed;
}

export async function requestJsonCompletion(
  system: string,
  user: string,
  timeoutMs: number,
  config: AiProviderConfig = resolveAiProvider(),
): Promise<unknown> {
  if (config.kind === "none" || !config.apiKey || !config.model)
    throw new Error("إعداد AI غير مكتمل.");
  if (config.kind === "gemini") {
    const raw = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      { "x-goog-api-key": config.apiKey },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      },
      timeoutMs,
    );
    const content = parseGeminiMessage(raw)?.content;
    if (!content) throw new Error("لم يُرجع نموذج الذكاء محتوى صالحًا.");
    return JSON.parse(content);
  }
  const raw = await postJson(
    config.url || "https://api.openai.com/v1/chat/completions",
    { Authorization: `Bearer ${config.apiKey}` },
    {
      model: config.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    timeoutMs,
  );
  const content = parseOpenAiMessage(raw)?.content;
  if (!content) throw new Error("لم يُرجع نموذج الذكاء محتوى صالحًا.");
  return JSON.parse(content);
}
