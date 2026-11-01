import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { isCurrency } from '@/lib/currency';
import { getUserSetting } from '@/lib/user-settings';
import { Investing } from '@/components/investing/Investing';

export const metadata: Metadata = { title: 'Card Investing', robots: { index: false, follow: false } };
export default async function InvestingPage() {
  const session = await auth();
  const currency = session?.user?.id ? await getUserSetting('currency', 'USD') : 'USD';
  return <Investing initialCurrency={isCurrency(currency) ? currency : 'USD'} />;
}
