/** @jsxImportSource @jgengine/core/ui/jsx */
import type { FormEvent } from "@jgengine/core/ui/jsx/dom.view";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { navigate } from "../../screens/screenRouter";
import { useLoginForm, useSignupForm } from "../../auth";
import { AuthOAuthSection } from "../../branding/components/AuthOAuthSection";
import { destinationAfterAuth, type PlayEntryIntent } from "../../runtime/playEntry";
import { Button, C, ErrorText, Field, FULL, Logo, Muted, Page, Row, Text } from "../../ui/kit";

export type AuthScreenMode = "sign-in" | "sign-up";

const AUTH_COPY = {
  "sign-in": {
    tagline: "Sign in and start scaling!",
    submitLabel: "Sign In",
    submitLoading: "Signing in…",
    googleActionLabel: "Sign in",
    alternateLead: "Don't have an account?",
    alternateRoute: "/signup" as const,
    alternateLabel: "Sign up",
  },
  "sign-up": {
    tagline: "Sign up and start scaling!",
    submitLabel: "Create Account",
    submitLoading: "Creating account…",
    googleActionLabel: "Sign up",
    alternateLead: "Already have an account?",
    alternateRoute: "/login" as const,
    alternateLabel: "Sign in",
  },
} as const;

/** What the auth form shows and does, from `useLoginForm` / `useSignupForm`. */
export interface AuthFormVm {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  error: string | null;
  isLoading: boolean;
  isGoogleLoading: boolean;
  isGuestLoading: boolean;
  submit: () => void;
  google: () => void;
  guest: () => void;
}

/** The browser's form checks the page used to make: an address with an @, and a long enough new password. */
export function authFormProblem(mode: AuthScreenMode, email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter your email address.";
  if (password.length === 0) return "Enter your password.";
  if (mode === "sign-up" && password.length < 8) return "Use at least 8 characters for your password.";
  return null;
}

/** The form's own events go to the auth hooks, which only cancel the default; native has none. */
const NATIVE_SUBMIT = { preventDefault: () => undefined } as unknown as FormEvent; // type-escape: the hooks read only preventDefault from the event

export function AuthScreenView({ mode, playIntent, form }: { mode: AuthScreenMode; playIntent?: PlayEntryIntent | undefined; form: AuthFormVm }) {
  const copy = AUTH_COPY[mode];
  const submit = () => { if (!form.isLoading && authFormProblem(mode, form.email, form.password) === null) form.submit(); };
  const problem = authFormProblem(mode, form.email, form.password);
  const typed = form.email.length > 0 || form.password.length > 0;
  return <Page maxWidth={448}>
    <Button tone="link" icon="back" onPress={() => void navigate({ to: "/" })}>Back</Button>
    <RuneView items="center" gap={12}>
      <Logo stacked size="md" />
      <Muted size={14} weight={600}>{copy.tagline}</Muted>
    </RuneView>
    <RuneView gap={12} width={FULL} label={copy.submitLabel}>
      <Field label="Email" value={form.email} onChange={form.setEmail} onSubmit={submit} placeholder="you@example.com" maxLength={254} />
      <Field label="Password" secret value={form.password} onChange={form.setPassword} onSubmit={submit} placeholder="••••••••" maxLength={128} />
      {form.error !== null ? <ErrorText>{form.error}</ErrorText> : typed && problem !== null ? <Muted size={13}>{problem}</Muted> : null}
      <Button tone="primary" width={FULL} busy={form.isLoading} busyLabel={copy.submitLoading}
        disabled={problem !== null} onPress={submit}>{copy.submitLabel}</Button>
    </RuneView>
    <Row justify="center" gap={4}>
      <Muted size={14}>{copy.alternateLead}</Muted>
      <Button tone="link" onPress={() => void navigate({ to: copy.alternateRoute, ...(playIntent ? { search: { intent: playIntent } } : {}) })}>{copy.alternateLabel}</Button>
    </Row>
    <Muted size={14} align="center" color={C.faint}>or</Muted>
    <AuthOAuthSection actionLabel={copy.googleActionLabel} loading={form.isGoogleLoading} onClick={form.google} />
    <Row justify="center" gap={4}>
      <Button tone="link" busy={form.isGuestLoading} busyLabel="Joining…" onPress={form.guest}>Play as guest</Button>
      <Text size={14} color={C.muted}>— progress won't be saved.</Text>
    </Row>
  </Page>;
}

function SignInAuthScreen({ playIntent }: { playIntent?: PlayEntryIntent | undefined }) {
  const form = useLoginForm(() => navigate(destinationAfterAuth(playIntent)), playIntent);
  return <AuthScreenView mode="sign-in" playIntent={playIntent} form={{ ...form, submit: () => void form.handleSubmit(NATIVE_SUBMIT), google: form.handleGoogleSignIn, guest: form.handleGuest }} />;
}

function SignUpAuthScreen({ playIntent }: { playIntent?: PlayEntryIntent | undefined }) {
  const form = useSignupForm(() => navigate(destinationAfterAuth(playIntent)), playIntent);
  return <AuthScreenView mode="sign-up" playIntent={playIntent} form={{ ...form, submit: () => void form.handleSubmit(NATIVE_SUBMIT), google: form.handleGoogleSignUp, guest: form.handleGuest }} />;
}

export function AuthScreen({ mode, playIntent }: { mode: AuthScreenMode; playIntent?: PlayEntryIntent | undefined }) {
  return mode === "sign-in" ? <SignInAuthScreen playIntent={playIntent} /> : <SignUpAuthScreen playIntent={playIntent} />;
}

export function LoginScreen({ playIntent }: { playIntent?: PlayEntryIntent | undefined }) {
  return <AuthScreen mode="sign-in" playIntent={playIntent} />;
}

export function SignupScreen({ playIntent }: { playIntent?: PlayEntryIntent | undefined }) {
  return <AuthScreen mode="sign-up" playIntent={playIntent} />;
}
