"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useFormStatus } from "react-dom";

function DeleteButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-red-700 px-5 font-semibold text-white disabled:opacity-60">{pending ? "Trinama…" : "Ištrinti"}</button>;
}

export function ConfirmDelete({ action, label, title, description }: { action: () => void | Promise<void>; label: string; title: string; description: string }) {
  return <Dialog.Root>
    <Dialog.Trigger className="min-h-12 rounded-xl border border-red-300 px-4 font-semibold text-red-800 focus-visible:ring-2 focus-visible:ring-red-600">{label}</Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/60" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
        <Dialog.Title className="text-xl font-bold">{title}</Dialog.Title>
        <Dialog.Description className="mt-3 text-sm leading-6 text-slate-700">{description}</Dialog.Description>
        <div className="mt-6 flex flex-wrap gap-3">
          <Dialog.Close className="min-h-12 rounded-xl border border-slate-300 px-5 font-semibold">Atšaukti</Dialog.Close>
          <form action={action}><DeleteButton /></form>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
