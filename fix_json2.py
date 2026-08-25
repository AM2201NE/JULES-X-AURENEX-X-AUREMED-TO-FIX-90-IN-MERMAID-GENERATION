import json

with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'r', encoding='utf-8') as f:
    content = f.read()

# The issue: string values in the JSON contain literal newlines instead of escaped \n
# We need to properly escape all string values in the JSON

# Approach: Use a state machine to parse the JSON and fix string values
# Or better: use a more lenient JSON parser, then re-serialize with proper escaping

# Let's try using the json module with a custom approach
# We'll parse it as a Python object using a more lenient method

# Actually, the simplest approach: use demjson or a custom parser
# But let's try a different approach - fix the specific problematic fields

# The file has multiple skills with "instructions" fields that contain literal newlines
# We need to find all string values and escape them properly

# Let's write a proper JSON fixer
def fix_json_strings(json_str):
    """Fix unescaped newlines and other control characters in JSON string values."""
    result = []
    i = 0
    in_string = False
    escape_next = False
    
    while i < len(json_str):
        ch = json_str[i]
        
        if not in_string:
            result.append(ch)
            if ch == '"':
                in_string = True
            i += 1
        else:
            if escape_next:
                result.append(ch)
                escape_next = False
                i += 1
            elif ch == '\\':
                result.append(ch)
                escape_next = True
                i += 1
            elif ch == '"':
                result.append(ch)
                in_string = False
                i += 1
            elif ch == '\n':
                result.append('\\n')
                i += 1
            elif ch == '\r':
                result.append('\\r')
                i += 1
            elif ch == '\t':
                result.append('\\t')
                i += 1
            elif ord(ch) < 32:
                # Other control characters
                result.append(f'\\u{ord(ch):04x}')
                i += 1
            else:
                result.append(ch)
                i += 1
    
    return ''.join(result)

# Fix the content
fixed_content = fix_json_strings(content)

# Validate it parses
try:
    parsed = json.loads(fixed_content)
    print("JSON parsed successfully!")
    print(f"Number of skills: {len(parsed)}")
    
    # Write back the fixed content
    with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'w', encoding='utf-8') as f:
        json.dump(parsed, f, ensure_ascii=False, indent=2)
    print("Fixed JSON written successfully!")
except json.JSONDecodeError as e:
    print(f"Still has JSON error: {e}")
    print(f"Error at position {e.pos}: {repr(fixed_content[e.pos:e.pos+20])}")