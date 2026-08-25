const str = `graph TD\nclass A start;\nclass B1, B2, C1, C2, D1, D2, E1, E2 process;\nE1e -. "Aggravé par" .-> E1a;`;
console.log(str.replace(/class\s+[A-Za-z0-9_,\s]+[A-Za-z0-9_]+;?/g, ''));
