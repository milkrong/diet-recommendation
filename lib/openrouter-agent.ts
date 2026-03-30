import {
  OpenRouter,
  stepCountIs,
  type Tool
} from "@openrouter/sdk";
import EventEmitter from "eventemitter3";

type TextContentPart = {
  type: string;
  text?: string | null;
};

type OpenRouterStreamItem = {
  id?: string | null;
  type: string;
  status?: string | null;
  name?: string | null;
  arguments?: string | null;
  callId?: string | null;
  output?: unknown;
  content?: TextContentPart[] | null;
};

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentEvents {
  "message:user": (message: Message) => void;
  "message:assistant": (message: Message) => void;
  "item:update": (item: OpenRouterStreamItem) => void;
  "stream:start": () => void;
  "stream:delta": (delta: string, accumulated: string) => void;
  "stream:end": (fullText: string) => void;
  "tool:call": (name: string, args: unknown) => void;
  "tool:result": (name: string, result: unknown) => void;
  "reasoning:update": (text: string) => void;
  error: (error: Error) => void;
  "thinking:start": () => void;
  "thinking:end": () => void;
}

export interface AgentConfig {
  apiKey: string;
  model?: string;
  instructions?: string;
  tools?: Tool[];
  maxSteps?: number;
  appUrl?: string;
  appName?: string;
}

type RequiredAgentConfig = Required<
  Omit<AgentConfig, "appUrl" | "appName">
> & {
  appUrl?: string;
  appName?: string;
};

export class Agent extends EventEmitter<AgentEvents> {
  private client: OpenRouter;
  private messages: Message[] = [];
  private config: RequiredAgentConfig;

  constructor(config: AgentConfig) {
    super();

    this.client = new OpenRouter({
      apiKey: config.apiKey,
      ...(config.appUrl ? { httpReferer: config.appUrl } : {}),
      ...(config.appName ? { appTitle: config.appName } : {})
    });

    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? "openrouter/auto",
      instructions: config.instructions ?? "You are a helpful assistant.",
      tools: config.tools ?? [],
      maxSteps: config.maxSteps ?? 5,
      appUrl: config.appUrl,
      appName: config.appName
    };
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  clearHistory(): void {
    this.messages = [];
  }

  setInstructions(instructions: string): void {
    this.config.instructions = instructions;
  }

  addTool(tool: Tool): void {
    this.config.tools.push(tool);
  }

  async send(content: string): Promise<string> {
    const userMessage: Message = { role: "user", content };
    this.messages.push(userMessage);
    this.emit("message:user", userMessage);
    this.emit("thinking:start");

    try {
      const result = this.client.callModel({
        model: this.config.model,
        instructions: this.config.instructions,
        input: this.messages.map((message) => ({
          role: message.role,
          content: message.content
        })),
        tools: this.config.tools.length > 0 ? this.config.tools : undefined,
        stopWhen: [stepCountIs(this.config.maxSteps)]
      });

      this.emit("stream:start");

      let fullText = "";

      for await (const item of result.getItemsStream()) {
        this.emit("item:update", item);

        if (item.type === "message") {
          const textContent = item.content?.find((entry) => entry.type === "output_text");

          if (textContent && "text" in textContent) {
            const nextText = textContent.text;
            if (nextText !== fullText) {
              const delta = nextText.slice(fullText.length);
              fullText = nextText;
              this.emit("stream:delta", delta, fullText);
            }
          }
        }

        if (item.type === "function_call" && item.status === "completed") {
          this.emit(
            "tool:call",
            item.name,
            JSON.parse(item.arguments || "{}")
          );
        }

        if (item.type === "function_call_output") {
          this.emit("tool:result", item.callId, item.output);
        }

        if (item.type === "reasoning") {
          const reasoningText = item.content?.find((entry) => entry.type === "reasoning_text");

          if (reasoningText && "text" in reasoningText) {
            this.emit("reasoning:update", reasoningText.text);
          }
        }
      }

      if (!fullText) {
        fullText = await result.getText();
      }

      this.emit("stream:end", fullText);

      const assistantMessage: Message = {
        role: "assistant",
        content: fullText
      };
      this.messages.push(assistantMessage);
      this.emit("message:assistant", assistantMessage);

      return fullText;
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this.emit("error", normalizedError);
      throw normalizedError;
    } finally {
      this.emit("thinking:end");
    }
  }

  async sendSync(content: string): Promise<string> {
    const userMessage: Message = { role: "user", content };
    this.messages.push(userMessage);
    this.emit("message:user", userMessage);

    try {
      const result = this.client.callModel({
        model: this.config.model,
        instructions: this.config.instructions,
        input: this.messages.map((message) => ({
          role: message.role,
          content: message.content
        })),
        tools: this.config.tools.length > 0 ? this.config.tools : undefined,
        stopWhen: [stepCountIs(this.config.maxSteps)]
      });

      const fullText = await result.getText();
      const assistantMessage: Message = {
        role: "assistant",
        content: fullText
      };
      this.messages.push(assistantMessage);
      this.emit("message:assistant", assistantMessage);

      return fullText;
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this.emit("error", normalizedError);
      throw normalizedError;
    }
  }
}

export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}
