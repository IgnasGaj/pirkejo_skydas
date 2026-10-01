import Link from "next/link";

export default function PurchaseNotFound() {
  return <main className="mx-auto max-w-2xl px-5 py-16"><h1 className="text-2xl font-bold">Pirkinio rasti nepavyko.</h1><Link href="/purchases" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-teal-800 px-5 font-semibold text-white">Mano pirkiniai</Link></main>;
}
