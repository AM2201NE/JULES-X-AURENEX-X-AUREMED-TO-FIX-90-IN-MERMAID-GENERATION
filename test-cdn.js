const urls = [
'https://cdn.tailwindcss.com',
'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js',
'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/contrib/auto-render.min.js',
'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js',
'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js',
'https://unpkg.com/docx@8.5.0/build/index.js',
'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.min.js',
'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];
Promise.all(urls.map(u => fetch(u).then(r => console.log(r.status, u)).catch(e => console.log('ERROR', u))))
