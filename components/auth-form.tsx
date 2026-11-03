"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { registerOrganization, signIn } from "@/lib/api";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setPending(true);
    try {
      if (mode === "register") {
        const organization = await registerOrganization({
          name: String(formData.get("organization") ?? ""),
          email: String(formData.get("email") ?? ""),
          website: String(formData.get("website") ?? ""),
          password: String(formData.get("password") ?? ""),
          logo: formData.get("logo") instanceof File ? formData.get("logo") as File : undefined,
        });
        window.localStorage.setItem("prowlet-organization", JSON.stringify(organization));
        setSubmitted(true);
      } else {
        const session = await signIn(
          String(formData.get("email") ?? ""),
          String(formData.get("password") ?? ""),
        );
        window.localStorage.setItem("prowlet-session", JSON.stringify(session));
        if (session.status === "approved" || session.status === "verified") {
          router.push("/dashboard");
        } else if (session.status === "pending") {
          setSubmitted(true);
          window.localStorage.setItem("prowlet-organization", JSON.stringify(session));
        } else {
          setError("This organization is not approved for issuer access.");
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <section className="route-panel state-warning" role="status">
        <p className="eyebrow">Organization submitted</p>
        <h1 className="route-title">Pending verification.</h1>
        <p className="route-intro">
          Your organization is awaiting review. Issuer tools will be available
          after the organization is approved.
        </p>
        <Link className="action action-secondary" href="/login">Go to sign in</Link>
      </section>
    );
  }

  const isRegister = mode === "register";
  return (
    <section className="route-panel auth-panel">
      <p className="eyebrow">{isRegister ? "For organizations" : "Issuer access"}</p>
      <h1 className="route-title">{isRegister ? "Create an issuer account." : "Welcome back."}</h1>
      <p className="route-intro">
        {isRegister
          ? "Register your organization to prepare and manage certificates."
          : "Sign in to continue to your certificate dashboard."}
      </p>
      <form className="field-stack" onSubmit={submit}>
        {isRegister && (
          <>
            <label htmlFor="organization">Organization name</label>
            <input id="organization" name="organization" required autoComplete="organization" />
          </>
        )}
        <label htmlFor="email">Official email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        {isRegister && (
          <>
            <label htmlFor="website">Website or domain</label>
            <input id="website" name="website" type="url" required placeholder="https://organization.example" />
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
            <label htmlFor="logo">Organization logo</label>
            <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
          </>
        )}
        {!isRegister && (
          <>
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required minLength={6} autoComplete="current-password" />
            {!process.env.NEXT_PUBLIC_PROWLET_API_URL && <p className="option-hint">Demo login: credentials@northline.example and any password with 6 or more characters.</p>}
          </>
        )}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <button className="action action-primary" type="submit" disabled={pending}>
          {pending ? "Please wait..." : isRegister ? "Submit organization" : "Sign in"}
          {!pending && <span aria-hidden="true">↗</span>}
        </button>
      </form>
      <p className="auth-switch">
        {isRegister ? "Already registered?" : "New organization?"}{" "}
        <Link href={isRegister ? "/login" : "/register"}>
          {isRegister ? "Sign in" : "Create an issuer account"}
        </Link>
      </p>
    </section>
  );
}
