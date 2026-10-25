import { langLabel } from "@/lib/format";

const languages: Record<string, string> = {
  eng: "English", jap: "Japanese", chn: "Chinese", kor: "Korean",
  fr: "French", de: "German", it: "Italian", es: "Spanish", pt: "Portuguese",
};

/** Use catalogue language metadata; similarity scores do not identify language. */
export function ScanLanguageBadge({ language }: { language?: string | null }) {
  const code = language?.trim().toLowerCase() ?? "";
  const label = languages[code] ?? (code ? langLabel(code) : "Language unknown");
  const colour = code === "eng" ? "border-sky-400/40 bg-sky-400/15 text-sky-200"
    : code === "jap" ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
    : "border-white/20 bg-white/10 text-fg";
  return <span className={`mt-1 inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${colour}`}>
    {label}
  </span>;
}
