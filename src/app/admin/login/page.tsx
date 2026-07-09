"use client";

import { useActionState } from "react";
import { useT } from "@/i18n";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: false };

/** admin 登录页(US-M1):朴素实用,不受公开站布局与动效约束(DESIGN_SPEC §6) */
export default function LoginPage() {
  const t = useT();
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-6">
      <h1 className="text-heading font-display">{t("admin.loginTitle")}</h1>
      <form action={formAction} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-caption font-mono uppercase text-muted">
          {t("admin.emailLabel")}
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            className="border border-border bg-background px-3 py-2 font-body text-body normal-case tracking-normal text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-caption font-mono uppercase text-muted">
          {t("admin.passwordLabel")}
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="border border-border bg-background px-3 py-2 font-body text-body normal-case tracking-normal text-foreground"
          />
        </label>
        {state.error && (
          <p role="alert" className="text-caption text-accent">
            {t("admin.loginError")}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer border border-foreground px-4 py-2 text-caption font-mono uppercase disabled:opacity-50"
        >
          {t("admin.loginButton")}
        </button>
      </form>
    </main>
  );
}
