import json

with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

# The issue: the file has literal newlines (\r\n and \n) inside string values
# But it also has already-escaped sequences like \\n and \\"
# We need to only escape the literal newlines, not the already-escaped ones

# Let's write a state machine that:
# 1. Tracks when we're inside a string value
# 2. When inside a string, replaces literal \r\n and \n with \\n and \\r
# 3. Preserves already-escaped sequences

def fix_json_literal_newlines(json_bytes):
    """Fix literal newlines in JSON string values while preserving escaped sequences."""
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
            elif ch == ord('\r'):
                # Check if next is \n (Windows line ending)
                if i + 1 < len(json_bytes) and json_bytes[i + 1] == ord('\n'):
                    result.extend(b'\\n')
                    i += 2
                else:
                    result.extend(b'\\r')
                    i += 1
            elif ch == ord('\n'):
                result.extend(b'\\n')
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
fixed_content = fix_json_literal_newlines(content)

# Validate
try:
    parsed = json.loads(fixed_content.decode('utf-8'))
    print("JSON parsed successfully!")
    print(f"Number of skills: {len(parsed)}")
    
    # Write back the fixed content
    with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'wb') as f:
        f.write(fixed_content)
    print("Fixed JSON written successfully!")
except json.JSONDecodeError as e:
    print(f"Still has JSON error: {e}")
    print(f"Error at position {e.pos}: {repr(fixed_content.decode('utf-8')[e.pos:e.pos+20])}")