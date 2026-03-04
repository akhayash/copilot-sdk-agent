/**
 * UI Component: Message Input
 */

'use client';

import React, { useState, useRef } from 'react';
import { AttachmentPreview } from './attachment-preview';
import type { Attachment } from '@/domain/entities/message';

interface MessageInputProps {
  onSend: (text: string, attachments?: Attachment[]) => void;
  disabled: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (text.trim()) {
      onSend(text, attachments.length > 0 ? attachments : undefined);
      setText('');
      setAttachments([]);
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Only accept text files for now
      if (!file.type.startsWith('text/') && file.type !== 'application/json') {
        continue;
      }

      const content = await file.text();
      const attachment: Attachment = {
        id: crypto.randomUUID(),
        filename: file.name,
        content,
        mimeType: file.type,
        size: file.size,
        uploadedAt: new Date(),
      };

      setAttachments((prev) => [...prev, attachment]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  return (
    <div className="flex flex-col space-y-2 p-4">
      {attachments.length > 0 && (
        <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="rounded-lg bg-gray-200 px-3 py-2 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
          title="Attach file"
        >
          📎
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.csv,.json"
          onChange={(e) => handleFileSelect(e.target.files)}
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
          placeholder="Type your message... (Shift+Enter for new line)"
          className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2 outline-none focus:border-blue-500 disabled:opacity-50"
          rows={3}
        />

        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
