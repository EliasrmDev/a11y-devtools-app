export interface AiClientPort {
  /** Send a completion request and return the full response */
  complete(params: AiCompletionParams): Promise<AiCompletionResult>;

  /** Send a completion request and return a readable stream */
  completeStream(params: AiCompletionParams): Promise<ReadableStream<Uint8Array>>;
}

export interface AiCompletionParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  customHeaders?: Record<string, string>;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
