import mermaid from 'mermaid';
import fs from 'fs';

mermaid.initialize({ startOnLoad: false });

const graph = `
flowchart TD
  A["Hyponatrémie (< 135 mEq/L)"]:::pathology
`;

async function test() {
  try {
    const { svg } = await mermaid.render('id', graph);
    console.log("SUCCESS");
  } catch(e) {
    console.log(e.message);
  }
}
test();
