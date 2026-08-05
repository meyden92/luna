declare global {
  interface Window {
    ollama?: OllamaAPI;
  }
}

// ============================================
// Core Types
// ============================================

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // Base64 encoded images
}

export interface ModelOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  num_predict?: number;
  stop?: string[];
  seed?: number;
  num_ctx?: number;
}

// ============================================
// Chat API
// ============================================

export interface ChatOptions {
  model: string;
  messages: Message[];
  stream?: boolean;
  format?: 'json' | string;
  options?: ModelOptions;
  keep_alive?: string | number;
}

export interface ChatResponse {
  model: string;
  created_at: string;
  message: Message;
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface ChatStreamChunk {
  model: string;
  created_at: string;
  message: Message;
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// ============================================
// Generate API
// ============================================

export interface GenerateOptions {
  model: string;
  prompt: string;
  stream?: boolean;
  suffix?: string;
  images?: string[]; // Base64 encoded
  format?: 'json' | string;
  options?: ModelOptions;
  system?: string;
  template?: string;
  context?: number[];
  raw?: boolean;
  keep_alive?: string | number;
}

export interface GenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  done_reason?: string;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface GenerateStreamChunk {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  done_reason?: string;
  context?: number[];
}

// ============================================
// Models API
// ============================================

export interface ModelInfo {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: ModelDetails;
}

export interface ModelDetails {
  parent_model?: string;
  format: string;
  family: string;
  families?: string[];
  parameter_size: string;
  quantization_level: string;
}

export interface ListResponse {
  models: ModelInfo[];
}

export interface ShowResponse {
  modelfile: string;
  parameters: string;
  template: string;
  details: ModelDetails;
  model_info: Record<string, unknown>;
}

// ============================================
// Embeddings API
// ============================================

export interface EmbedOptions {
  model: string;
  input: string | string[];
  truncate?: boolean;
  options?: ModelOptions;
  keep_alive?: string | number;
}

export interface EmbedResponse {
  model: string;
  embeddings: number[][];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
}

// ============================================
// Pull API
// ============================================

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

// ============================================
// Stream Interface
// ============================================

export interface OllamaStream<T> {
  /** Async iterator for streaming chunks */
  [Symbol.asyncIterator](): AsyncIterator<T>;

  /** Event-based handler for data chunks */
  on(event: 'data', handler: (chunk: T) => void): OllamaStream<T>;

  /** Event-based handler for errors */
  on(event: 'error', handler: (error: Error) => void): OllamaStream<T>;

  /** Event-based handler for stream completion */
  on(event: 'end', handler: (final?: T) => void): OllamaStream<T>;

  /** Abort the stream */
  abort(): void;
}

// ============================================
// Main API Interface
// ============================================

export interface OllamaAPI {
  /**
   * Chat completion - conversational AI
   * @param options - Chat options including model and messages
   * @returns Promise<ChatResponse> or OllamaStream<ChatStreamChunk> if stream: true
   */
  chat(options: ChatOptions): Promise<ChatResponse>;
  chat(options: ChatOptions & { stream: true }): OllamaStream<ChatStreamChunk>;

  /**
   * Text generation - single prompt completion
   * @param options - Generation options including model and prompt
   * @returns Promise<GenerateResponse> or OllamaStream<GenerateStreamChunk> if stream: true
   */
  generate(options: GenerateOptions): Promise<GenerateResponse>;
  generate(options: GenerateOptions & { stream: true }): OllamaStream<GenerateStreamChunk>;

  /**
   * List available models
   * @returns Promise with list of installed models
   */
  list(): Promise<ListResponse>;

  /**
   * Show model details
   * @param model - Model name
   * @returns Promise with model information
   */
  show(model: string): Promise<ShowResponse>;

  /**
   * Pull/download a model (requires 'pull' permission)
   * @param model - Model name to pull
   * @returns Stream of pull progress
   */
  pull(model: string): OllamaStream<PullProgress>;

  /**
   * Generate embeddings
   * @param options - Embedding options
   * @returns Promise with embedding vectors
   */
  embed(options: EmbedOptions): Promise<EmbedResponse>;

  /**
   * Check if Ollama server is reachable
   * @returns Promise<boolean>
   */
  ping(): Promise<boolean>;

  /**
   * Abort all pending requests
   */
  abort(): void;
}

export {};
