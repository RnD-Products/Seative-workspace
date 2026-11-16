import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="text-xl font-semibold">We couldn&apos;t find that page</h1>
        <p className="text-sm text-muted-foreground">It may not exist, or you may not have access to it.</p>
        <Link href="/" className="inline-block pt-2 text-sm font-medium text-primary hover:underline">Back to overview</Link>
      </div>
    </main>
  );
}
