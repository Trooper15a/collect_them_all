/** Applies the saved theme before paint to avoid a flash. Dark is the default. */
export function ThemeScript() {
  const code = `try{var t=localStorage.getItem("theme");if(t==="light")document.documentElement.setAttribute("data-theme","light");var b=localStorage.getItem("bgColor");if(b)document.documentElement.setAttribute("data-bg",b);}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
