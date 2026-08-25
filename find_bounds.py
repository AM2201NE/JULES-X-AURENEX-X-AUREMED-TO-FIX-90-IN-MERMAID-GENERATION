import json

with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the biomarker-landscape-scanner instructions value boundaries
idx = content.find('biomarker-landscape-scanner')
inst_idx = content.find('instructions', idx)
val_start = content.find('"', inst_idx + 13) + 1

# Find the end of this string value (handling escaped quotes)
def find_string_end(s, start):
    i = start
    while i < len(s):
        if s[i] == '"':
            # Check if escaped
            if i > 0 and s[i-1] == '\\':
                i += 1
                continue
            return i
        i += 1
    return -1

val_end = find_string_end(content, val_start)
print('Value start:', val_start)
print('Value end:', val_end)
print('Value length:', val_end - val_start)
print('First 200 chars:', repr(content[val_start:val_start+200]))
print('Last 200 chars:', repr(content[val_end-200:val_end]))