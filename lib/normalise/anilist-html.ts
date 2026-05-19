export function stripAnilistHtml(text: string): string {
  return text
    .replace(/<br\s*\/?\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
}
