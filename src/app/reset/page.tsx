import { Suspense } from "react";
import { PasswordResetForm } from "@/components/PasswordResetForm";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="card">
          <p className="hint">Ładowanie…</p>
        </div>
      }
    >
      <PasswordResetForm />
    </Suspense>
  );
}
