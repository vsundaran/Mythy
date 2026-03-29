const testStr = `
1. This is the first item
Here is its body.

2. This is the second
And its body.

Myth 3: Breastfeeding
Let's see.

4) Parentheses check
Body here.
`;

const mythRegex = /(?:^|\n)\s*(?:Myth\s*)?(\d+)[\.\:\)]?\s+([^\n\r]*)/gi;
const matches = [...testStr.matchAll(mythRegex)];
for (const match of matches) {
  console.log(`Matched: [${match[1]}] Title: [${match[2]}] at index ${match.index}`);
}
