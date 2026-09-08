/**
 * Applies the saved appearance before paint to avoid a flash.
 * Midnight (dark theme + blue background) is the default.
 * Light theme and background are mutually exclusive: "light" clears data-bg,
 * and only "black"/"blue" are accepted as stored backgrounds — any stale or
 * incompatible localStorage key is removed so a broken state can't persist.
 */
export function ThemeScript() {
  const code = `try{var d=document.documentElement;var t=localStorage.getItem("theme");var b=localStorage.getItem("bgColor");if(t==="light"){d.setAttribute("data-theme","light");d.removeAttribute("data-bg");if(b)localStorage.removeItem("bgColor");}else{d.removeAttribute("data-theme");if(b==="black"||b==="blue"){d.setAttribute("data-bg",b);}else{d.removeAttribute("data-bg");if(b)localStorage.removeItem("bgColor");}}}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
