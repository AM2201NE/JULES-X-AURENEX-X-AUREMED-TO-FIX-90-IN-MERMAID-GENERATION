import json

with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

# Fix 1: Missing closing quote after "mermaid_code_block" at position 10746
idx1 = content.find(b'mermaid_code_block')
quote_pos1 = idx1 + 18
content = content[:quote_pos1] + b'"' + content[quote_pos1:]

# Fix 2: Missing closing quote after "Chart Types" - should be "**Chart Types**:" not "**Chart Types":"
idx2 = content.find(b'**Chart Types":')
if idx2 != -1:
    # Replace the incorrect pattern with correct one
    content = content[:idx2] + b'**Chart Types**:' + content[idx2 + 14:]

# Validate
try:
    parsed = json.loads(content.decode('utf-8'))
    print('JSON parsed successfully!')
    print(f'Number of skills: {len(parsed)}')
    
    # Write back
    with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'wb') as f:
        f.write(content)
    print('Fixed JSON written successfully!')
except json.JSONDecodeError as e:
    print(f'Still has JSON error: {e}')
    print(f'Error at position {e.pos}: {repr(content.decode("utf-8")[e.pos:e.pos+50])}')