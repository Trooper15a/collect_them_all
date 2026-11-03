export default function Loading() {
  return (
    <div role="status" aria-label="Loading page" aria-live="polite" className="space-y-4 py-6">
      <span className="sr-only">Loading page…</span>
      <div aria-hidden="true" className="space-y-4">
        <div className="skeleton h-7 w-40 rounded-xl" />
        <div className="skeleton h-24 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-40 rounded-xl" />
          <div className="skeleton h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
