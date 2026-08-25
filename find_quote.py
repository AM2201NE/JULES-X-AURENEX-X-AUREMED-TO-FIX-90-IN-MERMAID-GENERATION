import json

with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

# Find the actual closing quote of the instructions value
val_start = 4199
# Search for the closing quote
for i in range(val_start, min(val_start + 7000, len(content))):
    if content[i] == ord('"'):
        # Check if escaped
        if i > 0 and content[i-1] == ord('\\'):
            continue
        print(f'Found quote at {i}: {repr(content[i-30:i+30])}')
        break