import {
  AI_CAPTION_SYSTEM_PROMPT,
  parseAiCaptionResponse,
  type AiCaptionItem,
} from "@/lib/ai/post-plan";

interface CaptionRequestItem {
  videoItemId: string;
  title: string;
}

interface OpenRouterMessage {
  role: "system" | "user";
  content: string;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export async function generateCaptionsWithOpenRouter(params: {
  items: CaptionRequestItem[];
  language: "vi" | "en";
}): Promise<AiCaptionItem[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }

  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  const messages: OpenRouterMessage[] = [
    { role: "system", content: AI_CAPTION_SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify({
        language: params.language,
        responseFormat: {
          items: [{ videoItemId: "string", caption: "string" }],
        },
        items: params.items.map((item) => ({
          videoItemId: item.videoItemId,
          title: item.title,
        })),
      }),
    },
  ];

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "",
      "X-Title": "Find Video Trending",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as OpenRouterResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenRouter caption generation failed");
  }

  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenRouter returned an empty response");
  }

  return parseAiCaptionResponse({
    raw,
    expectedVideoItemIds: params.items.map((item) => item.videoItemId),
  });
}
