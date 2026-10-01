import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 text-sm text-muted">The page you are looking for does not exist in this demo.</p>
      <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand">
        Go to the dashboard
      </Link>
    </div>
  );
}
