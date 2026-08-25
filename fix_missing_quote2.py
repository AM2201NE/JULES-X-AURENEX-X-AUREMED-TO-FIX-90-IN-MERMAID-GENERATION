import json

with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

# The issue: missing closing quote after "mermaid_code_block" before "},"
# Find the position
idx = content.find(b'mermaid_code_block')
print('Found at:', idx)
print('Context:', repr(content[idx-10:idx+30]))

# The closing quote should be at idx + 18 (after "mermaid_code_block")
quote_pos = idx + 18
print('Byte at quote_pos:', repr(content[quote_pos:quote_pos+1]))

# Insert the missing quote
new_content = content[:quote_pos] + b'"' + content[quote_pos:]

# Validate
try:
    parsed = json.loads(new_content.decode('utf-8'))
    print('JSON parsed successfully!')
    print(f'Number of skills: {len(parsed)}')
    
    # Write back
    with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'wb') as f:
        f.write(new_content)
    print('Fixed JSON written successfully!')
except json.JSONDecodeError as e:
    print(f'Still has JSON error: {e}')
    print(f'Error at position {e.pos}: {repr(new_content.decode("utf-8")[e.pos:e.pos+20])}')