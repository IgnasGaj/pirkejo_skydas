"use client";

import { useFormStatus } from "react-dom";

export function UploadButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white disabled:opacity-60">{pending ? "Įkeliama…" : "Įkelti failą"}</button>;
}
