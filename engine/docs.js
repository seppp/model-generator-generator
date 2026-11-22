// The AI-chat prompt on the website includes docs/RECIPES.md, minus the parts
// that only make sense in the repo. In the markdown:
//   <!-- dev-only --> ... <!-- /dev-only -->   left out of the chat version
//   <!-- chat: text -->                        shown only in the chat version
// Other HTML comments are dropped from the chat version too.
export function chatReference(md) {
  return md
    .replace(/<!-- dev-only -->[\s\S]*?<!-- \/dev-only -->/g, '')
    .replace(/<!-- chat: ([\s\S]*?) -->/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
