import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { getRates, isCurrency } from '@/lib/currency';
import { getUserSetting } from '@/lib/user-settings';
import { CardShow } from '@/components/card-show/CardShow';

export const metadata: Metadata = { title: 'Card Show', robots: { index: false, follow: false } };

export default async function CardShowPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const [fx, preferredCurrency] = await Promise.all([getRates(), userId ? getUserSetting('currency', 'USD') : Promise.resolve('USD')]);
  const identity = userId ? encodeURIComponent(userId) : 'guest';
  return <CardShow key={identity} storageKey={`rnp-card-show:${identity}`} initialCurrency={isCurrency(preferredCurrency) ? preferredCurrency : 'USD'} fx={fx} guest={!userId} />;
}
