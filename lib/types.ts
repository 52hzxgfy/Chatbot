import { Part } from '@google/generative-ai';

export interface Conversation {
  id: number;
  title: string;
  messages: Message[];
  lastUpdated: Date;
  isEditing?: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export type ModelType = "Llama 3.1 70B" | "Gemini 1.5 Flash" | "Qwen/Qwen2.5-72B-Instruct";

export interface ApiKeys {
  "Llama 3.1 70B": string;
  "Gemini 1.5 Flash": string;
  "Qwen/Qwen2.5-72B-Instruct": string;
}

export interface ChatHistoryMessage {
  role: 'user' | 'model';
  parts: Part[];
}

export interface FileData {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

export interface FileContent {
  fileData: FileData;
  text?: string;
}
