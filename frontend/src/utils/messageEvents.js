// Fired when messages are read or sent, so the top-bar message icon refreshes its count straight away.
export const MESSAGES_CHANGED = 'adram:messages-changed';

export const announceMessagesChanged = () => window.dispatchEvent(new Event(MESSAGES_CHANGED));
