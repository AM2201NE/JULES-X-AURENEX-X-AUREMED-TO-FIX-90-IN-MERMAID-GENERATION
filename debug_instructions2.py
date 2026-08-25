import json

with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

# Find the instructions field for biomarker-landscape-scanner
idx = content.find(b'biomarker-landscape-scanner')
inst_idx = content.find(b'instructions', idx)
print('instructions at:', inst_idx)

# Find the opening quote after 'instructions:'
val_start = content.find(b'"', inst_idx + 13) + 1
print('value starts at:', val_start)

# Look for the closing quote - it should be before the next field
# Let's look at a large chunk
print('Value start context:', repr(content[val_start:val_start+200]))

# Now find where the value should end - look for the next field pattern
# The next field after instructions would be "category" or "}"
# Let's search for the pattern that follows
remaining = content[val_start:]
# Find the next occurrence of a field pattern (", "fieldname":)
import re
# Look for the end of the string value - it should be a quote followed by comma or }
# But we need to handle escaped quotes inside the string
# Let's just look for the pattern that appears after the instructions value
print()
print('Looking for end of instructions value...')
# The value should end before "category" or "subcategory" or "}"
# Let's search for the next field
for field in [b'category', b'subcategory', b'apiSpecifications', b'citationFormat', b'imageGeneration', b'outputSchema', b'executionSteps', b'referenceModules', b'hardRules', b'maturityFrameworks']:
    pos = remaining.find(b'"' + field + b'"')
    if pos != -1:
        print(f'Found {field} at offset {pos} from value start')
        print(f'Context: {repr(remaining[max(0,pos-50):pos+50])}')
        break

# Also check for the closing brace of the object
brace_pos = remaining.find(b'}')
print(f'First }} at offset {brace_pos}')
print(f'Context: {repr(remaining[max(0,brace_pos-50):brace_pos+50])}')