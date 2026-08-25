import re
import json
import sys

# Updated to use your actual filename
input_file = 'medical-skills-data.json'
output_file = 'medical-skills-data_fixed.json'

print(f"Reading {input_file}...")
try:
    with open(input_file, 'r', encoding='utf-8') as f:
        text = f.read()
except FileNotFoundError:
    print(f"ERROR: Could not find '{input_file}'.")
    print("Please ensure the JSON file is in the exact same folder as this script.")
    sys.exit(1)

print("Fixing instructions fields (newlines, unescaped quotes, missing closing quotes)...")
parts = text.split('"instructions": "')
result = [parts[0]]

for i in range(1, len(parts)):
    part = parts[i]
    
    # ROBUST BOUNDARY DETECTION:
    # Find the exact boundary where the instructions string ends and the JSON structure resumes.
    # We look for a closing brace } (with optional comma) that is immediately followed by 
    # the start of the next skill { or the end of the array/category ] or }.
    match = re.search(r'\n(\s*\}\s*,?\s*)(?=\{|\]|\})', part)
    
    if match:
        # Extract the raw markdown content
        content = part[:match.start()].rstrip()
        
        # Remove trailing quote if it was present in the original broken text
        if content.endswith('"'):
            content = content[:-1]
            
        # Fix markdown typos where JSON syntax leaked into the text (e.g., **Key": -> **Key**:)
        content = re.sub(r'\*\*([a-zA-Z0-9_-]+)":', r'**\1**:', content)
        content = re.sub(r'\*\*Types":', r'**Types**:', content)
        
        # Normalize and properly escape all double quotes for JSON
        content = content.replace('\\"', '"')
        content = content.replace('"', '\\"')
        
        # Replace literal newlines with JSON-safe \n
        content = content.replace('\r\n', '\\n').replace('\n', '\\n')
        
        # Reconstruct the fixed JSON segment
        fixed_part = '"instructions": "' + content + '"' + match.group(1) + part[match.end():]
        result.append(fixed_part)
    else:
        # Fallback (should not be reached with valid file structure)
        result.append('"instructions": "' + part)

fixed_text = "".join(result)

print("Fixing known schema typos...")
# Fix the duplicated "type" key in the methods-section-architect skill
fixed_text = fixed_text.replace('"context": { "type": "type": "string"', '"context": { "type": "string"')

print("Parsing and formatting JSON...")
try:
    data = json.loads(fixed_text)
    clean_json = json.dumps(data, indent=2, ensure_ascii=False)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(clean_json)
        
    print(f"\n✅ SUCCESS! The valid JSON has been saved to '{output_file}'.")
except json.JSONDecodeError as e:
    print(f"\n❌ Failed to parse JSON: {e}")
    print("Saving raw fixed text to 'debug_fixed_text.txt' for manual inspection...")
    with open('debug_fixed_text.txt', 'w', encoding='utf-8') as f:
        f.write(fixed_text)