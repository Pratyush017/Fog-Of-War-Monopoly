const fs = require('fs');

const html = fs.readFileSync('stitch_appearance/code.html', 'utf-8');

const animals = ['cat', 'fox', 'dog', 'bear', 'bunny', 'owl'];
if (!fs.existsSync('public/avatars')) {
  fs.mkdirSync('public/avatars', { recursive: true });
}

animals.forEach(animal => {
  const commentStr = `<!-- SVG: The ${animal.charAt(0).toUpperCase() + animal.slice(1)}`;
  const commentIndex = html.indexOf(commentStr);
  if (commentIndex === -1) {
    console.log(`Could not find ${animal} comment.`);
    return;
  }
  const svgStart = html.indexOf('<svg', commentIndex);
  const svgEnd = html.indexOf('</svg>', svgStart) + 6;
  let svg = html.substring(svgStart, svgEnd);
  
  // modify svg to have normal width and height for standalone usage if needed
  // svg = svg.replace(/class="[^"]*"/, 'width="96" height="96"');

  fs.writeFileSync(`public/avatars/${animal}.svg`, svg);
  console.log(`Wrote public/avatars/${animal}.svg`);
});
