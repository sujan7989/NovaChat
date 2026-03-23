export type Gender = "male" | "female" | "other";
export type Pref = "male" | "female" | "any";
export type AppState = "landing" | "setup" | "searching" | "chatting";

export interface Message {
  id: string;
  from: "me" | "stranger";
  type: "text" | "image";
  text?: string;
  dataUrl?: string;
  caption?: string;
  timestamp: number;
}

export interface UserProfile {
  userId: string;
  gender: Gender;
  pref: Pref;
  interests: string[];
  languages?: string[];  // optional array — empty means "any language"
  vibes?: string[];      // optional array of mood tags
}
