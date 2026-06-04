import fs from 'fs';

const content = fs.readFileSync('./src/views/AdminPage.vue', 'utf8');
const lines = content.split('\n');

let openTags = [];
let errors = [];
let inScript = false;
let inStyle = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  
  if (line.trim().startsWith('<script')) {
    inScript = true;
    continue;
  }
  if (line.trim().startsWith('</script')) {
    inScript = false;
    continue;
  }
  if (line.trim().startsWith('<style')) {
    inStyle = true;
    continue;
  }
  if (line.trim().startsWith('</style')) {
    inStyle = false;
    continue;
  }
  
  if (inScript || inStyle) {
    continue;
  }
  
  const openMatches = line.match(/<(div|template|p|h3|label|button|span)/g);
  const closeMatches = line.match(/<\/(div|template|p|h3|label|button|span)/g);
  
  if (openMatches) {
    for (const match of openMatches) {
      const tagName = match.match(/<(div|template|p|h3|label|button|span)/)[1];
      openTags.push({ tag: tagName, line: lineNum });
    }
  }
  
  if (closeMatches) {
    for (const match of closeMatches) {
      const tagName = match.match(/<\/(div|template|p|h3|label|button|span)/)[1];
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
    message: `Unclosed tags at end: ${openTags.map(t => `<${t.tag}> on line ${t.line}`).join(', ')}`
  });
}

if (errors.length > 0) {
  console.log('Found tag mismatches:');
  errors.forEach(e => console.log(`Line ${e.line}: ${e.message}`));
} else {
  console.log('All tags are properly matched.');
}
