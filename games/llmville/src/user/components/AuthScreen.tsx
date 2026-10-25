import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useLoginForm, useSignupForm } from "@/auth";
import { AuthOAuthSection } from "@/branding/components/AuthOAuthSection";
import { BrandLogo } from "@/branding/components/BrandLogo";
import { destinationAfterAuth, type PlayEntryIntent } from "@/runtime/playEntry";

export type AuthScreenMode = "sign-in" | "sign-up";

interface AuthScreenProps {
  mode: AuthScreenMode;
  playIntent?: PlayEntryIntent;
}

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

function AuthScreenShell({
  tagline,
  children,
}: {
  tagline: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 overflow-hidden game-bg-grid text-brand-cream">
      <div className="absolute inset-0">
        <div className="absolute left-1/4 top-1/4 h-[400px] w-[400px] rounded-full bg-[#e0a95c]/8 blur-[120px] animate-pulse" />
        <div
          className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-[#5fc2a8]/8 blur-[120px] animate-pulse"
          style={{ animationDelay: "1s" }}
        />
      </div>

      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-2 text-lg font-semibold text-brand-teal transition-colors hover:text-brand-cream"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.25} />
            Back
          </Link>

          <div className="mb-7 flex flex-col items-center text-center">
            <BrandLogo variant="stacked" size="md" />
            <p className="mt-4 text-sm font-medium text-brand-cream/65">{tagline}</p>
          </div>

          <div className="flex w-full flex-col gap-3">{children}</div>
        </div>
      </main>
    </div>
  );
}

interface AuthScreenBodyProps {
  mode: AuthScreenMode;
  playIntent?: PlayEntryIntent;
  error: string | null;
  isLoading: boolean;
  isGoogleLoading: boolean;
  isGuestLoading: boolean;
  onSubmit: (event: FormEvent) => void;
  onGoogle: () => void;
  onGuest: () => void;
  formFields: ReactNode;
}

function AuthScreenBody({
  mode,
  playIntent,
  error,
  isLoading,
  isGoogleLoading,
  isGuestLoading,
  onSubmit,
  onGoogle,
  onGuest,
  formFields,
}: AuthScreenBodyProps) {
  const copy = AUTH_COPY[mode];
  const guestHref = `${mode === "sign-up" ? "/signup" : "/login"}${
    playIntent ? `?intent=${encodeURIComponent(playIntent)}` : ""
  }`;

  return (
    <>
      <form onSubmit={onSubmit} className="game-auth-form">
        {formFields}
        {error ? <p className="text-sm text-[#f0a097]">{error}</p> : null}
        <Button
          type="submit"
          variant="primary"
          disabled={isLoading}
          className="w-full py-3.5 text-base disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
              {copy.submitLoading}
            </span>
          ) : (
            copy.submitLabel
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-brand-cream/60">
        {copy.alternateLead}{" "}
        <Link
          to={copy.alternateRoute}
          search={playIntent ? { intent: playIntent } : undefined}
          className="font-semibold text-brand-teal transition-colors hover:text-brand-cream"
        >
          {copy.alternateLabel}
        </Link>
      </p>

      <p className="text-center text-sm font-medium text-brand-cream/45">or</p>

      <AuthOAuthSection actionLabel={copy.googleActionLabel} loading={isGoogleLoading} onClick={onGoogle} />

      <p className="text-center text-sm text-brand-cream/60">
        <a
          href={guestHref}
          onClick={(event) => {
            event.preventDefault();
            if (!isGuestLoading) onGuest();
          }}
          aria-disabled={isGuestLoading}
          className="font-semibold text-brand-teal underline decoration-brand-teal/40 underline-offset-4 transition-colors hover:text-brand-cream hover:decoration-brand-cream aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          {isGuestLoading ? "Joining…" : "Play as guest"}
        </a>{" "}
        — progress won't be saved.
      </p>
    </>
  );
}

function AuthCredentialFields({
  mode,
  email,
  setEmail,
  password,
  setPassword,
}: {
  mode: AuthScreenMode;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
}) {
  return (
    <>
      <div className="game-form-field">
        <label htmlFor={`${mode}-email`} className="game-field-label">
          Email
        </label>
        <input
          id={`${mode}-email`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          className="game-input game-input--spacious"
          placeholder="you@example.com"
        />
      </div>
      <div className="game-form-field">
        <label htmlFor={`${mode}-password`} className="game-field-label">
          Password
        </label>
        <input
          id={`${mode}-password`}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={mode === "sign-up" ? 8 : undefined}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          className="game-input game-input--spacious"
          placeholder="••••••••"
        />
      </div>
    </>
  );
}

function SignInAuthScreen({ playIntent }: { playIntent?: PlayEntryIntent }) {
  const navigate = useNavigate();
  const form = useLoginForm(() => navigate(destinationAfterAuth(playIntent)), playIntent);
  const copy = AUTH_COPY["sign-in"];

  return (
    <AuthScreenShell tagline={copy.tagline}>
      <AuthScreenBody
        mode="sign-in"
        playIntent={playIntent}
        error={form.error}
        isLoading={form.isLoading}
        isGoogleLoading={form.isGoogleLoading}
        isGuestLoading={form.isGuestLoading}
        onSubmit={form.handleSubmit}
        onGoogle={form.handleGoogleSignIn}
        onGuest={form.handleGuest}
        formFields={
          <AuthCredentialFields
            mode="sign-in"
            email={form.email}
            setEmail={form.setEmail}
            password={form.password}
            setPassword={form.setPassword}
          />
        }
      />
    </AuthScreenShell>
  );
}

function SignUpAuthScreen({ playIntent }: { playIntent?: PlayEntryIntent }) {
  const navigate = useNavigate();
  const form = useSignupForm(() => navigate(destinationAfterAuth(playIntent)), playIntent);
  const copy = AUTH_COPY["sign-up"];

  return (
    <AuthScreenShell tagline={copy.tagline}>
      <AuthScreenBody
        mode="sign-up"
        playIntent={playIntent}
        error={form.error}
        isLoading={form.isLoading}
        isGoogleLoading={form.isGoogleLoading}
        isGuestLoading={form.isGuestLoading}
        onSubmit={form.handleSubmit}
        onGoogle={form.handleGoogleSignUp}
        onGuest={form.handleGuest}
        formFields={
          <AuthCredentialFields
            mode="sign-up"
            email={form.email}
            setEmail={form.setEmail}
            password={form.password}
            setPassword={form.setPassword}
          />
        }
      />
    </AuthScreenShell>
  );
}

export function AuthScreen({ mode, playIntent }: AuthScreenProps) {
  return mode === "sign-in" ? (
    <SignInAuthScreen playIntent={playIntent} />
  ) : (
    <SignUpAuthScreen playIntent={playIntent} />
  );
}

export function LoginScreen({ playIntent }: { playIntent?: PlayEntryIntent }) {
  return <AuthScreen mode="sign-in" playIntent={playIntent} />;
}

export function SignupScreen({ playIntent }: { playIntent?: PlayEntryIntent }) {
  return <AuthScreen mode="sign-up" playIntent={playIntent} />;
}
