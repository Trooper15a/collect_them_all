export function haptic(style: "light" | "medium" | "heavy" = "medium") {
  try {
    if ("vibrate" in navigator) {
      const ms = style === "light" ? 10 : style === "heavy" ? 30 : 20;
      navigator.vibrate(ms);
    }
  } catch {}
}
