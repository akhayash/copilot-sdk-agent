/**
 * UI Component: Message Input
 * Supports file attachment via button and drag & drop.
 */

'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Paperclip, Send, Upload } from 'lucide-react';
import { AttachmentPreview } from './attachment-preview';
import type { Attachment } from '@/domain/entities/message';

/** Accepted file extensions and MIME types */
const ACCEPTED_EXTENSIONS = [
  '.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml',
  '.ts', '.js', '.py', '.html', '.css',
  '.pdf',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
].join(',');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface MessageInputProps {
  onSend: (text: string, attachments?: Attachment[]) => void;
  disabled: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleSend = () => {
    if (text.trim()) {
      onSend(text, attachments.length > 0 ? attachments : undefined);
      setText('');
      setAttachments([]);
    }
  };

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const newAttachments: Attachment[] = [];

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) continue;

      // Read as text for text-based files, base64 for binary
      const isText = file.type.startsWith('text/') ||
        ['application/json', 'application/xml', 'application/yaml'].includes(file.type) ||
        /\.(md|csv|json|xml|yaml|yml|ts|js|py|html|css|txt)$/i.test(file.name);

      let content: string;
      if (isText) {
        content = await file.text();
      } else {
        const buffer = await file.arrayBuffer();
        content = `[binary:${btoa(String.fromCharCode(...new Uint8Array(buffer).slice(0, 1024)))}...]`;
      }

      newAttachments.push({
        id: crypto.randomUUID(),
        filename: file.name,
        content,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        uploadedAt: new Date(),
      });
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await processFiles(e.target.files);
    e.target.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files?.length) {
      await processFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      className="mx-auto w-full max-w-4xl px-4 py-3"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <div className="mb-2">
          <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />
        </div>
      )}

      <div
        className={`relative flex items-end gap-2 rounded-2xl border p-2 transition-all ${
          isDragging ? 'border-blue-400 ring-2 ring-blue-100' : 'focus-within:border-blue-400'
        }`}
        style={{ background: 'var(--surface)', borderColor: isDragging ? undefined : 'var(--border)' }}
      >
        {/* Drop overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-blue-50/90">
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--accent)' }}>
              <Upload size={18} />
              ファイルをドロップして添付
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 disabled:opacity-40"
          style={{ color: 'var(--text-secondary)' }}
          title="ファイルを添付"
        >
          <Paperclip size={16} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileSelect}
          className="hidden"
        />

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={disabled}
          placeholder="メッセージを入力... (Shift+Enter で改行)"
          className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none disabled:opacity-50"
          style={{ color: 'var(--foreground)' }}
          rows={1}
        />

        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white transition-colors disabled:opacity-40"
          style={{ background: disabled || !text.trim() ? 'var(--border)' : 'var(--accent)' }}
        >
          <Send size={16} />
        </button>
      </div>

      <p className="mt-1.5 text-center text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        AIは間違えることがあります。重要な情報は確認してください。
      </p>
    </div>
  );
}
