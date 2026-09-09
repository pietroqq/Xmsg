export type Profile = {
  id: string;
  username: string;
  name: string;
  bio: string | null;
  avatar_id: string | null;
  accent: string;
  background: 'aurora' | 'midnight' | 'nebula' | 'white';
  density: 'comfortable' | 'compact';
};

export type Conversation = {
  id: string;
  peer: Profile;
  preview: string;
  updated: number;
  unread: number;
};

export type Message = {
  id: string;
  sender: string;
  body: string;
  created: number;
  file_id: string | null;
  filename: string | null;
  mime: string | null;
  read_at: number | null;
};
