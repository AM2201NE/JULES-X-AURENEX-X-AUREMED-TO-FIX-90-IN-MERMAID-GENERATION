const raw = 'classDef start fill:#2e7d32,stroke:#1b5e20; classDef process fill:#fbc02d;';
const out = raw.replace(/classDef\s+[a-zA-Z0-9_]+\s+fill:#([0-9a-fA-F]{3,6})/g, (match, hex) => {
   return match; 
});
console.log(out);
