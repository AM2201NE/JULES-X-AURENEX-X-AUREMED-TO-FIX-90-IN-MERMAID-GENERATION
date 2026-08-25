import json

# Read the file as bytes to avoid encoding issues
with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content_bytes = f.read()

# Find biomarker-landscape-scanner
idx = content_bytes.find(b'biomarker-landscape-scanner')
if idx >= 0:
    inst_idx = content_bytes.find(b'instructions', idx)
    if inst_idx >= 0:
        # Find the opening quote after 'instructions':
        val_start = content_bytes.find(b'"', inst_idx + 13) + 1
        # Find the next skill
        next_skill = content_bytes.find(b'"name": "literature-evidence-mapper"', val_start)
        if next_skill >= 0:
            # The value is between val_start and next_skill - 2 (before the comma and newline)
            value_bytes = content_bytes[val_start:next_skill-2]
            print('Value length:', len(value_bytes))
            print('First 200:', repr(value_bytes[:200]))
            print('Last 200:', repr(value_bytes[-200:]))
            print()
            print('val_start:', val_start)
            print('next_skill:', next_skill)
            print('next_skill-2:', next_skill-2)