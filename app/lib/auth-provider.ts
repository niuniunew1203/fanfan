export type AuthProfile = {
  provider: "demo" | "guest" | "wechat";
  subject: string;
  displayName: string;
  avatarUrl: string;
};

export interface AuthProvider {
  readonly id: AuthProfile["provider"];
  resolveProfile(subject: string): Promise<AuthProfile | null>;
}

const demoProfiles: Record<string, Omit<AuthProfile, "provider" | "subject">> = {
  "demo-lin": { displayName: "小林", avatarUrl: "/avatars/lin.jpg" },
  "demo-mum": { displayName: "妈妈", avatarUrl: "/avatars/mum.jpg" },
  "demo-chen": { displayName: "阿辰", avatarUrl: "/avatars/chen.jpg" },
};

export const demoAuthProvider: AuthProvider = {
  id: "demo",
  async resolveProfile(subject) {
    const profile = demoProfiles[subject];
    return profile ? { provider: "demo", subject, ...profile } : null;
  },
};

// A future WeChat provider should exchange the OAuth code on the server and map
// unionid/openid, nickname and headimgurl into AuthProfile. Business records only
// reference the internal user id, so connecting WeChat does not migrate meals.
