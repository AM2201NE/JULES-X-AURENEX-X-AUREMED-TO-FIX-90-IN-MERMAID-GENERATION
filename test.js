const str1 = 'D1a -. "Lié à" . E1';
console.log(str1.replace(/-\.\s*['"]?([^'"]+)['"]?\s*\.(-|>|->)?/g, '-.->|"$1"|'));

const str2 = `graph TD
A[Start] --> B(Process);classDef start fill:#2e7d32,stroke:#1b5e20,color:white;class A start;class B1, B2, C1, C2, D1, D2, E1, E2 process;
`;
// Remove classDef and class assignments
const clean = str2
    .replace(/classDef\s+[^;\n]+;?/g, '')
    .replace(/class\s+[A-Za-z0-9_,\s]+[A-Za-z0-9_]+;?/g, '');
console.log(clean);
