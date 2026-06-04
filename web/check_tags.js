import fs from 'fs';

const content = fs.readFileSync('./src/views/AdminPage.vue', 'utf8');
const lines = content.split('\n');

let openTags = [];
let errors = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;

  const openMatches = line.match(/<([a-z][a-z0-9]*)(?=[^>]*(?:[^/]>|$))(?!.*\/>)/gi);
  const closeMatches = line.match(/<\/([a-z][a-z0-9]*)/gi);

  if (openMatches) {
    for (const match of openMatches) {
      const tagName = match.match(/<([a-z][a-z0-9]*)/i)[1].toLowerCase();
      if (!['br', 'hr', 'input', 'img', 'link', 'meta', 'col'].includes(tagName)) {
        openTags.push({ tag: tagName, line: lineNum });
      }
    }
  }

  if (closeMatches) {
    for (const match of closeMatches) {
      const tagName = match.match(/<\/([a-z][a-z0-9]*)/i)[1].toLowerCase();
      const lastOpen = openTags.pop();
      if (!lastOpen || lastOpen.tag !== tagName) {
        errors.push({
          line: lineNum,
          message: lastOpen 
            ? `Mismatched tag: closing </${tagName}> but expected </${lastOpen.tag}>` 
            : `Unexpected closing tag </${tagName}>`
        });
      }
    }
  }
}

if (openTags.length > 0) {
  errors.push({
    line: lines.length,
    message: `Unclosed tags at end: ${openTags.map(t => `<${t.tag}>`).join(', ')}`
  });
}

if (errors.length > 0) {
  console.log('Found tag mismatches:');
  errors.forEach(e => console.log(`Line ${e.line}: ${e.message}`));
} else {
  console.log('All tags are properly matched.');
}
