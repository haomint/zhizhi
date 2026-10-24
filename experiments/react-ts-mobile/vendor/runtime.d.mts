export interface Completion {
  choices: Array<{
    finish_reason: string;
    message: {
      content?: string;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
  }>;
}
export interface RuntimeResult {
  result: unknown;
  audit: { stage: string; requests: number; toolCalls: number; trace: string[]; piVersion: string };
}
export function runStage(input: {
  stage: string;
  context: Record<string, unknown>;
  system: string;
  request: (payload: unknown, options?: { signal?: AbortSignal }) => Promise<Completion>;
  signal?: AbortSignal;
  timeoutMs?: number;
  onEvent?: (type: string) => void;
}): Promise<RuntimeResult>;
