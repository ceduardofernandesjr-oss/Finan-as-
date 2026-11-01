"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

function translate(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).";
  if (/User already registered/i.test(msg)) return "Já existe uma conta com este e-mail. Entre ou recupere a senha.";
  if (/Password should be at least/i.test(msg)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/rate limit|too many/i.test(msg)) return "Muitas tentativas. Espere alguns minutos e tente de novo.";
  if (/weak|pwned/i.test(msg)) return "Essa senha é fraca ou já vazou em outro site. Escolha outra.";
  if (/Failed to fetch/i.test(msg)) return "Sem conexão com o servidor.";
  return msg;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(params.get("erro") ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(translate(error.message));
    const back = params.get("voltar");
    router.replace(back && back.startsWith("/") && !back.startsWith("//") ? back : "/");
    router.refresh();
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-lg font-semibold">Entrar</h1>
      {params.get("confirmado") && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">E-mail confirmado. Agora é só entrar.</p>}
      {params.get("senha") && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Senha alterada. Entre com a nova senha.</p>}
      <Field label="E-mail">
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Senha">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      <Button type="submit" className="w-full" loading={busy}>Entrar</Button>
      <div className="flex justify-between text-sm">
        <Link href="/recuperar-senha" className="text-navy-600 hover:underline dark:text-navy-300">Esqueci a senha</Link>
        <Link href="/cadastro" className="font-medium text-navy-600 hover:underline dark:text-navy-300">Criar conta</Link>
      </div>
    </form>
  );
}

export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As senhas não são iguais.");
    setBusy(true);
    setError("");
    const { data, error } = await supabase().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirmar` },
    });
    setBusy(false);
    if (error) return setError(translate(error.message));
    if (data.session) {
      router.replace("/");
      router.refresh();
    } else setDone(true);
  };
  if (done)
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-lg font-semibold">Confirme seu e-mail</h1>
        <p className="text-slate-600 dark:text-slate-300">Enviamos um link para <strong>{email}</strong>. Abra o e-mail e clique no link para ativar a conta.</p>
        <Link href="/entrar" className="font-medium text-navy-600">Voltar para entrar</Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-lg font-semibold">Criar conta</h1>
      <Field label="E-mail">
        <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Senha" hint="Pelo menos 8 caracteres">
        <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Repita a senha">
        <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      <Button type="submit" className="w-full" loading={busy}>Criar conta</Button>
      <p className="text-center text-sm">
        Já tem conta? <Link href="/entrar" className="font-medium text-navy-600 hover:underline dark:text-navy-300">Entrar</Link>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirmar?proximo=/redefinir-senha`,
    });
    setBusy(false);
    if (error) return setError(translate(error.message));
    setSent(true);
  };
  return sent ? (
    <div className="space-y-3 text-sm">
      <h1 className="text-lg font-semibold">Verifique seu e-mail</h1>
      <p className="text-slate-600 dark:text-slate-300">Se existir uma conta com {email}, você vai receber um link para criar uma nova senha.</p>
      <Link href="/entrar" className="font-medium text-navy-600">Voltar para entrar</Link>
    </div>
  ) : (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-lg font-semibold">Recuperar senha</h1>
      <Field label="E-mail">
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button type="submit" className="w-full" loading={busy}>Enviar link</Button>
      <Link href="/entrar" className="block text-center text-sm text-navy-600">Voltar</Link>
    </form>
  );
}

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    setBusy(true);
    const { error } = await supabase().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(translate(error.message));
    await supabase().auth.signOut();
    router.replace("/entrar?senha=1");
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-lg font-semibold">Nova senha</h1>
      <Field label="Nova senha" hint="Pelo menos 8 caracteres">
        <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button type="submit" className="w-full" loading={busy}>Salvar nova senha</Button>
    </form>
  );
}
