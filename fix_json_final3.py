import json

with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

# The value is between val_start (4199) and val_end (10799 - the closing quote)
val_start = 4199
val_end = 10799  # This is the position of the closing quote

# Extract the value (without the surrounding quotes)
value_bytes = content[val_start:val_end]
print('Value length:', len(value_bytes))
print('First 200:', repr(value_bytes[:200]))
print('Last 200:', repr(value_bytes[-200:]))

# Decode and properly escape
value_str = value_bytes.decode('utf-8')
print('Decoded length:', len(value_str))

# Properly escape for JSON
escaped_value = json.dumps(value_str)[1:-1]  # Remove surrounding quotes
print('Escaped length:', len(escaped_value))
print('Escaped first 200:', repr(escaped_value[:200]))
print('Escaped last 200:', repr(escaped_value[-200:]))

# Now reconstruct: content up to val_start + escaped_value + content from val_end (including the closing quote)
new_content = content[:val_start] + escaped_value.encode('utf-8') + content[val_end:]

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