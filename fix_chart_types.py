import json

with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

# Find the problematic pattern: **Chart Types": [
idx = content.find(b'**Chart Types": [')
print('Found at:', idx)
print('Context:', repr(content[idx-10:idx+50]))

# Fix it: should be "**Chart Types": [ (quote before colon)
# The issue is the quote is after the colon instead of before
# Pattern: **Chart Types": [  ->  "**Chart Types": [
fixed = content[:idx] + b'"**Chart Types": [' + content[idx+16:]

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
    print(f'Error at position {e.pos}: {repr(fixed.decode("utf-8")[e.pos:e.pos+20])}')