import json

with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

# The issue: string values contain literal newlines (\n) and other control characters
# instead of escaped sequences (\\n). We need to parse the JSON structure and fix string values.

# Let's use a more robust approach: parse with a custom decoder that handles unescaped newlines
# Or better: use a state machine to fix string values

def fix_json_control_chars(json_bytes):
    """Fix unescaped control characters in JSON string values."""
    result = bytearray()
    i = 0
    in_string = False
    escape_next = False
    
    while i < len(json_bytes):
        ch = json_bytes[i]
        
        if not in_string:
            result.append(ch)
            if ch == ord('"'):
                in_string = True
            i += 1
        else:
            if escape_next:
                result.append(ch)
                escape_next = False
                i += 1
            elif ch == ord('\\'):
                result.append(ch)
                escape_next = True
                i += 1
            elif ch == ord('"'):
                result.append(ch)
                in_string = False
                i += 1
            elif ch == ord('\n'):
                result.extend(b'\\n')
                i += 1
            elif ch == ord('\r'):
                result.extend(b'\\r')
                i += 1
            elif ch == ord('\t'):
                result.extend(b'\\t')
                i += 1
            elif ch < 32:
                # Other control characters
                result.extend(f'\\u{ch:04x}'.encode('ascii'))
                i += 1
            else:
                result.append(ch)
                i += 1
    
    return bytes(result)

# Fix the content
fixed_content = fix_json_control_chars(content)

# Validate
try:
    parsed = json.loads(fixed_content.decode('utf-8'))
    print("JSON parsed successfully!")
    print(f"Number of skills: {len(parsed)}")
    
    # Write back
    with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'wb') as f:
        f.write(fixed_content)
    print("Fixed JSON written successfully!")
except json.JSONDecodeError as e:
    print(f"Still has JSON error: {e}")
    print(f"Position: {e.pos}")
    print(f"Context: {repr(fixed_content.decode('utf-8')[e.pos:e.pos+20])}")