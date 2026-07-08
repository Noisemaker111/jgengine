import type { GitHubClient } from "../client";

export interface UserProfile {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  followers: number;
  following: number;
  publicRepos: number;
  avatarUrl: string;
  createdAt: string;
  hireable: boolean | null;
}

interface RawUser {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  followers: number;
  following: number;
  public_repos: number;
  avatar_url: string;
  created_at: string;
  hireable: boolean | null;
}

/** Fetch a public user profile. */
export async function user(gh: GitHubClient, login: string): Promise<UserProfile> {
  const raw = await gh.rest<RawUser>(`/users/${encodeURIComponent(login)}`);
  return {
    login: raw.login,
    name: raw.name,
    bio: raw.bio,
    company: raw.company,
    location: raw.location,
    blog: raw.blog,
    followers: raw.followers,
    following: raw.following,
    publicRepos: raw.public_repos,
    avatarUrl: raw.avatar_url,
    createdAt: raw.created_at,
    hireable: raw.hireable,
  };
}
