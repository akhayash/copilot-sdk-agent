/**
 * UI Component: Attachment Preview
 */

'use client';

import React from 'react';
import type { Attachment } from '@/domain/entities/message';

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((att) => (
        <div key={att.id} className="flex items-center space-x-2 rounded-lg bg-gray-100 px-3 py-1">
          <span className="text-sm font-medium text-gray-700">📄 {att.filename}</span>
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            className="ml-1 text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
