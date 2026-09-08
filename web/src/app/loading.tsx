export default function Loading() {
  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center gap-6">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[#f472b6] border-r-[#a78bfa] animate-spin" />
        <div className="absolute inset-1.5 rounded-full border-[3px] border-transparent border-b-[#60a5fa] border-l-[#34d399] animate-spin" style={{ animationDirection: "reverse", animationDuration: "0.8s" }} />
        <div className="absolute inset-3 rounded-full border-[3px] border-transparent border-t-[#fbbf24] border-r-[#fb923c] animate-spin" style={{ animationDuration: "1.2s" }} />
      </div>
      <div className="text-lg font-bold bg-gradient-to-r from-[#f472b6] via-[#a78bfa] via-[#60a5fa] via-[#34d399] to-[#fbbf24] bg-clip-text text-transparent bg-[length:300%_300%] animate-[rainbow-shift_4s_ease_infinite]">
        RipnPull
      </div>
    </div>
  );
}
