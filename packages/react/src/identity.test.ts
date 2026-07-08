import { describe, expect, test } from "bun:test";

import { betterAuthIdentity, clerkIdentity, guestIdentity } from "./identity";

describe("clerkIdentity", () => {
  test("reports loading until Clerk resolves", () => {
    expect(clerkIdentity({ isLoaded: false, isSignedIn: undefined, user: undefined })).toEqual({
      session: null,
      isLoading: true,
    });
  });

  test("signed out yields a settled null session", () => {
    expect(clerkIdentity({ isLoaded: true, isSignedIn: false, user: null })).toEqual({
      session: null,
      isLoading: false,
    });
  });

  test("maps the useUser shape onto AuthSession", () => {
    const createdAt = new Date(1000);
    const source = clerkIdentity(
      {
        isLoaded: true,
        isSignedIn: true,
        user: {
          id: "user_abc",
          fullName: "Ada Lovelace",
          imageUrl: "https://img.example/ada.png",
          primaryEmailAddress: { emailAddress: "ada@example.com" },
          createdAt,
          lastSignInAt: createdAt,
        },
      },
      { signOut: () => undefined },
    );
    expect(source.isLoading).toBe(false);
    expect(source.signOut).toBeDefined();
    expect(source.session).toEqual({
      userId: "user_abc",
      displayName: "Ada Lovelace",
      avatarUrl: "https://img.example/ada.png",
      email: "ada@example.com",
      isNew: true,
    });
  });

  test("falls back to username and marks returning users as not new", () => {
    const source = clerkIdentity({
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: "user_def",
        fullName: null,
        username: "grace",
        createdAt: new Date(1000),
        lastSignInAt: new Date(99_000),
      },
    });
    expect(source.session).toEqual({ userId: "user_def", displayName: "grace", isNew: false });
  });
});

describe("betterAuthIdentity", () => {
  test("reports loading while pending", () => {
    expect(betterAuthIdentity({ data: null, isPending: true })).toEqual({
      session: null,
      isLoading: true,
    });
  });

  test("signed out yields a settled null session", () => {
    expect(betterAuthIdentity({ data: null, isPending: false })).toEqual({
      session: null,
      isLoading: false,
    });
  });

  test("maps the useSession shape onto AuthSession", () => {
    const source = betterAuthIdentity(
      {
        data: {
          user: {
            id: "ba_123",
            name: "Alan Turing",
            email: "alan@example.com",
            image: "https://img.example/alan.png",
          },
        },
        isPending: false,
      },
      { signOut: () => undefined },
    );
    expect(source.isLoading).toBe(false);
    expect(source.signOut).toBeDefined();
    expect(source.session).toEqual({
      userId: "ba_123",
      displayName: "Alan Turing",
      avatarUrl: "https://img.example/alan.png",
      email: "alan@example.com",
    });
  });
});

describe("guestIdentity", () => {
  test("is settled immediately with a stable guest session", () => {
    const source = guestIdentity("dev");
    expect(source.isLoading).toBe(false);
    expect(source.session?.userId).toBe(guestIdentity("dev").session?.userId);
  });
});
