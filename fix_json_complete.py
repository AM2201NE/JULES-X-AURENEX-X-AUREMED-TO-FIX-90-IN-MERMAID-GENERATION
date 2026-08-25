import json

with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

# The issue is that the JSON string values contain unescaped newlines and other control characters
# We need to properly escape all string values in the JSON

# Let's decode first to see the structure
decoded = content.decode('utf-8')

# The problem is that the JSON was constructed with literal newlines in string values
# instead of escaped \n sequences. We need to fix this.

# Approach: Parse the JSON with a custom decoder that handles unescaped newlines in strings
# Or better: Use a state machine to properly escape string values

# Let's write a proper fixer that:
# 1. Finds all string values in the JSON
# 2. Properly escapes them (newlines -> \n, tabs -> \t, etc.)
# 3. Reconstructs the JSON

def fix_json_strings(json_bytes):
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
            elif ch < 32:  # Control character (including newline, tab, etc.)
                # Escape it
                if ch == 10:  # \n
                    result.extend(b'\\n')
                elif ch == 13:  # \r
                    result.extend(b'\\r')
                elif ch == 9:  # \t
                    result.extend(b'\\t')
                elif ch == 8:  # \b
                    result.extend(b'\\b')
                elif ch == 12:  # \f
                    result.extend(b'\\f')
                else:
                    # Other control chars - use unicode escape
                    result.extend(f'\\u{ch:04x}'.encode('ascii'))
                i += 1
            else:
                result.append(ch)
                i += 1
    
    return bytes(result)

# Fix the JSON
fixed = fix_json_strings(content)

# Validate
try:
    parsed = json.loads(fixed.decode('utf-8'))
    print('JSON parsed successfully!')
    print(f'Number of skills: {len(parsed)}')
    
    # Write back
    with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'wb') as f:
        f.write(fixed)
    print('Fixed JSON written successfully!')
except json.JSONDecodeError as e:
    print(f'Still has JSON error: {e}')
    print(f'Error at position {e.pos}: {repr(fixed.decode("utf-8")[e.pos:e.pos+50])}')