"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Notice } from "@/shared";

export function LoginPanel({ supabase, onNotice }: { supabase: SupabaseClient; onNotice: (notice: Notice) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isBusy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) onNotice({ type: "error", message: error.message });
  }

  async function requestViewer() {
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (!error && data.user) {
      await supabase.from("signup_requests").insert({
        auth_user_id: data.user.id,
        email,
        name,
        status: "pending_approval"
      });
    }
    setBusy(false);
    onNotice(
      error
        ? { type: "error", message: error.message }
        : { type: "success", message: "Đã gửi yêu cầu viewer. Quản lý sẽ duyệt trước khi dùng." }
    );
  }

  return (
    <main className="loginShell">
      <section className="loginPanel">
        <img src="/chill-logo.png" alt="Chill Coffee Garden" className="loginLogo" />
        <p className="eyebrow">Chill Manager v2</p>
        <h1>Trạm vận hành quán</h1>
        <p className="muted">
          Đăng nhập bằng Supabase Auth. Tài khoản và quyền được kiểm soát bởi RLS trên backend.
        </p>
        <label className="fieldStack">
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="owner@chill.local"
            type="email"
          />
        </label>
        <label className="fieldStack">
          Mật khẩu
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            type="password"
          />
        </label>
        <label className="fieldStack">
          Tên viewer khi tự đăng ký
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Lan" />
        </label>
        <div className="buttonRow">
          <button className="primaryButton" disabled={isBusy} type="button" onClick={signIn}>
            Đăng nhập
          </button>
          <button className="ghostButton" disabled={isBusy} type="button" onClick={requestViewer}>
            Đăng ký viewer
          </button>
        </div>
      </section>
    </main>
  );
}
