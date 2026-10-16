export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** The file name without its extension, or a fallback when nothing is left. */
export function titleFromFileName(name: string, fallback: string): string {
  return name.replace(/\.[^.]+$/, '') || fallback;
}
