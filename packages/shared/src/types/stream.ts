// Claude Code stream-json message types
// Ref: claude --print --output-format stream-json

export interface StreamMessageBase {
  type: string;
  session_id?: string;
}

export interface AssistantMessage extends StreamMessageBase {
  type: "assistant";
  message: {
    role: "assistant";
    content: ContentBlock[];
  };
}

export interface ResultMessage extends StreamMessageBase {
  type: "result";
  result: string;
  is_error: boolean;
  duration_ms: number;
  total_cost_usd: number;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type StreamMessage = AssistantMessage | ResultMessage;
