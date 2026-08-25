const cleanFullTextForParsing = `
Here are the cards:
[
  { "id": 1 },
  { "id": 2 }
]
Have you extracted all? NO
[
  { "id": 3 }
]
ALL_DONE
`;

const arrayMatch = cleanFullTextForParsing.match(/\[\s*\{/);
if (arrayMatch && arrayMatch.index !== undefined) {
    const startIndex = arrayMatch.index;
    const lastBrace = cleanFullTextForParsing.lastIndexOf('}');
    if (lastBrace > startIndex) {
        let mergedJson = cleanFullTextForParsing.substring(startIndex, lastBrace + 1);
        mergedJson = mergedJson.replace(/\}\s*\][\s\S]*?\[\s*\{/g, '},{');
        const testJson = mergedJson + ']';
        console.log("Original parsed text:")
        console.log(cleanFullTextForParsing.substring(startIndex, lastBrace + 1))
        
        console.log("Merged json:")
        console.log(mergedJson)
        console.log("Test json:")
        console.log(testJson);
        try {
            console.log("Parsed result:", JSON.parse(testJson));
        } catch (e) {
            console.error("Parse error:", e);
        }
    }
}
