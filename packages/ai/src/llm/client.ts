export interface LlmRequest {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface LlmClient {
  readonly provider: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
