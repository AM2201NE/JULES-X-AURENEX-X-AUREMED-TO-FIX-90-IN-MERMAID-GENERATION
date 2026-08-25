const str = 'A[Start] --> B(Process);classDef start fill:#2e7d32,stroke:#1b5e20,color:white;class A start;class B1, B2, C1, C2, D1, D2, E1, E2 process;\nclass E3 another;\nclassDef more;';
console.log(str
  .replace(/(?:^|;)[ \t]*classDef\s+[^;\n]+;?/g, '')
  .replace(/(?:^|;)[ \t]*class\s+[a-zA-Z0-9_,\-\s]+[a-zA-Z0-9_]+;?/g, '')
);
