export type Message = {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  mentions: string[];
  edited_at: string | null;
  created_at: string;
};
export type ChatSummary = {
  id: string;
  kind: 'dm' | 'project';
  project_id: string | null;
  other_id: string | null;
  last_message_at: string | null;
  unread: number;
  last_body: string | null;
  last_author: string | null;
};
export const CHAT_PAGE = 60;
/** Messages from the same person within this many minutes are grouped. */
export const GROUP_MINUTES = 5;
