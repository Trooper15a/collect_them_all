import { SetBrowser } from "@/components/SetBrowser";
import { LookupTabs } from "@/components/LookupTabs";

export default function SetsPage() {
  return <div><header className="pt-2 pb-3"><h1 className="text-xl font-bold uppercase tracking-wider">Set Lookup</h1></header><LookupTabs active="sets" /><SetBrowser /></div>;
}
