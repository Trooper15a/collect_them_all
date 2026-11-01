import Link from 'next/link';

export function LookupTabs({ active }: { active: 'cards' | 'sets' }) {
  return <nav aria-label="Lookup type" className="grid grid-cols-2 rounded-xl border border-line bg-elev p-1 mb-4">
    {([{ href: '/sets', key: 'sets', label: 'Set Lookup' }, { href: '/cards', key: 'cards', label: 'Card Lookup' }] as const).map((item) => <Link key={item.key} href={item.href} aria-current={active === item.key ? 'page' : undefined} className={`text-center text-sm font-semibold rounded-lg px-3 py-3 ${active === item.key ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'}`}>{item.label}</Link>)}
  </nav>;
}
