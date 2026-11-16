import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { authConfigured } from "@/lib/auth";
import { connection } from "next/server";

export const metadata: Metadata = { title: "Sign in · +twe AI Interviewer", robots: { index: false } };

async function Login({ searchParams }: PageProps<"/login">) {
  await connection();
  const { next } = await searchParams;
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return <LoginForm next={safeNext} configured={authConfigured()} />;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Suspense>
      <Login {...props} />
    </Suspense>
  );
}
