const m = require('mermaid').default;
m.initialize({ startOnLoad: false, securityLevel: 'loose' });

async function test() {
  // Test 1: classDef with quoted hex
  const t1 = [
    'graph TD',
    'classDef organ fill:"#1976d2",stroke:"#0d47a1",color:"#ffffff"',
    'A:::organ'
  ].join('\n');
  try {
    await m.render('t1', t1);
    console.log('T1 (quoted hex) OK');
  } catch(e) {
    console.log('T1 FAIL:', (e && e.message || String(e)).substring(0, 200));
  }

  // Test 2: classDef without quotes
  const t2 = [
    'graph TD',
    'classDef organ fill:#1976d2,stroke:#0d47a1,color:#ffffff',
    'A:::organ'
  ].join('\n');
  try {
    await m.render('t2', t2);
    console.log('T2 (unquoted hex) OK');
  } catch(e) {
    console.log('T2 FAIL:', (e && e.message || String(e)).substring(0, 200));
  }

  // Test 3: style with quoted hex
  const t3 = [
    'graph TD',
    'A[Node]',
    'style A fill:"#1976d2",stroke:"#0d47a1",color:"#ffffff"'
  ].join('\n');
  try {
    await m.render('t3', t3);
    console.log('T3 (style quoted hex) OK');
  } catch(e) {
    console.log('T3 FAIL:', (e && e.message || String(e)).substring(0, 200));
  }

  // Test 4: style without quotes
  const t4 = [
    'graph TD',
    'A[Node]',
    'style A fill:#1976d2,stroke:#0d47a1,color:#ffffff'
  ].join('\n');
  try {
    await m.render('t4', t4);
    console.log('T4 (style unquoted hex) OK');
  } catch(e) {
    console.log('T4 FAIL:', (e && e.message || String(e)).substring(0, 200));
  }
}

test().then(() => { console.log('Done'); process.exit(0); });