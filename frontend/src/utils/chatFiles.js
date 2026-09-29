// Helpers for chat attachments (shared by the message list and the composer).

// Must match the server's limits in backend/portal/messaging.py.
export const MAX_ATTACHMENT_MB = 10;
export const MAX_VOICE_SECONDS = 300;
export const ATTACHMENT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rtf,.odt,.jpg,.jpeg,.png,.webp,.gif,.heic,.mp3,.m4a,.wav,.ogg,.oga,.aac,.opus';

export const formatSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDuration = (seconds) => {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const FILE_ICONS = {
  pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word', odt: 'fa-file-word', rtf: 'fa-file-word',
  xls: 'fa-file-excel', xlsx: 'fa-file-excel', csv: 'fa-file-csv', ppt: 'fa-file-powerpoint', pptx: 'fa-file-powerpoint',
  zip: 'fa-file-zipper', txt: 'fa-file-lines', mp3: 'fa-file-audio', m4a: 'fa-file-audio', wav: 'fa-file-audio',
  jpg: 'fa-file-image', jpeg: 'fa-file-image', png: 'fa-file-image', webp: 'fa-file-image', gif: 'fa-file-image', heic: 'fa-file-image',
};
export const fileIcon = (name = '') => FILE_ICONS[name.split('.').pop().toLowerCase()] || 'fa-file';

// Checked before uploading, so people aren't left waiting for a file the server will refuse.
export const checkAttachment = (file) => {
  const ext = `.${file.name.split('.').pop().toLowerCase()}`;
  if (!ATTACHMENT_ACCEPT.split(',').includes(ext)) return 'Send a PDF, Word, Excel or PowerPoint file, a photo, a text/CSV/ZIP file or an audio clip.';
  if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) return `Files can be up to ${MAX_ATTACHMENT_MB} MB.`;
  return null;
};
