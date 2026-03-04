/**
 * Domain Entity: Message
 * Represents a message in the chat conversation
 */

export interface Attachment {
  id: string;
  filename: string;
  content: string; // For text files (markdown, csv, txt)
  mimeType: string;
  size: number; // bytes
  uploadedAt: Date;
}

export type MessageRole = 'user' | 'assistant' | 'error';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  attachments?: Attachment[];
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface ChatHistory {
  messages: Message[];
}
