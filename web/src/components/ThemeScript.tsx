/**
 * Applies the saved appearance before paint to avoid a flash.
 * Graphite is the default; saved true-black and midnight choices stay available.
 * Light theme and background are mutually exclusive: "light" clears data-bg.
 * Migrates old "blue" bgColor to "midnight".
 */
export function ThemeScript() {
  const code = `try{var d=document.documentElement;var t=localStorage.getItem("theme");var b=localStorage.getItem("bgColor");if(b==="blue"){b="midnight";localStorage.setItem("bgColor","midnight");}if(t==="light"){d.setAttribute("data-theme","light");d.removeAttribute("data-bg");if(b)localStorage.removeItem("bgColor");}else{d.removeAttribute("data-theme");if(b==="black"||b==="midnight"){d.setAttribute("data-bg",b);}else{d.removeAttribute("data-bg");if(b)localStorage.removeItem("bgColor");}}}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
