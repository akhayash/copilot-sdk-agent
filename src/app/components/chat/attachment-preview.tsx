/**
 * UI Component: Attachment Preview
 */

'use client';

import React from 'react';
import { X, FileText, FileSpreadsheet, FileCode, FileImage, File, FileArchive } from 'lucide-react';
import type { Attachment } from '@/domain/entities/message';

function getFileIcon(mimeType: string, filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return <FileText size={14} className="text-red-500" />;
  if (['doc', 'docx'].includes(ext)) return <FileText size={14} className="text-blue-600" />;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet size={14} className="text-green-600" />;
  if (['ppt', 'pptx'].includes(ext)) return <FileText size={14} className="text-orange-500" />;
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return <FileImage size={14} className="text-purple-500" />;
  if (['json', 'ts', 'js', 'py', 'html', 'css', 'xml'].includes(ext)) return <FileCode size={14} className="text-amber-600" />;
  if (['zip', 'tar', 'gz'].includes(ext)) return <FileArchive size={14} className="text-gray-500" />;
  if (mimeType.startsWith('text/')) return <FileText size={14} className="text-gray-600" />;
  return <File size={14} className="text-gray-500" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

function AttachmentItem({ att, onRemove }: { att: Attachment; onRemove: (id: string) => void }) {
  const isImageDataUrl = att.content.startsWith('data:image/');

  if (isImageDataUrl) {
    return (
      <div
        className="relative rounded-lg border overflow-hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.content}
          alt={att.filename}
          className="h-20 w-24 object-cover"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
          <span className="block truncate text-[10px] text-white">{att.filename}</span>
        </div>
        <button
          type="button"
          onClick={() => onRemove(att.id)}
          className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 transition-colors hover:bg-black/80"
        >
          <X size={10} className="text-white" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {getFileIcon(att.mimeType, att.filename)}
      <span className="max-w-[160px] truncate font-medium" style={{ color: 'var(--foreground)' }}>
        {att.filename}
      </span>
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {formatSize(att.size)}
      </span>
      <button
        type="button"
        onClick={() => onRemove(att.id)}
        className="ml-1 rounded p-0.5 transition-colors hover:bg-gray-200"
        style={{ color: 'var(--text-secondary)' }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((att) => (
        <AttachmentItem key={att.id} att={att} onRemove={onRemove} />
      ))}
    </div>
  );
}
