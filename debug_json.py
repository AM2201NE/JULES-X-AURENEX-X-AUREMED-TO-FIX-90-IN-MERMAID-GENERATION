import json

with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'r', encoding='utf-8') as f:
    content = f.read()

# The issue is likely that the instructions string has literal newlines
# Let's check the biomarker-landscape-scanner instructions
idx = content.find('biomarker-landscape-scanner')
if idx >= 0:
    inst_idx = content.find('instructions', idx)
    if inst_idx >= 0:
        # Find the start of the string value (after the colon and space)
        val_start = content.find('"', inst_idx + 13) + 1
        # Find the end of the string value
        end_marker = '",\n        }'
        end_pos = content.find(end_marker, val_start)
        if end_pos >= 0:
            inst_value = content[val_start:end_pos]
            print('Instructions value length:', len(inst_value))
            # Check for unescaped newlines
            lines = inst_value.split('\n')
            print('Number of lines in value:', len(lines))
            if len(lines) > 1:
                print('First few lines:')
                for i, line in enumerate(lines[:5]):
                    print('  Line {}: {}'.format(i, repr(line[:100])))
                print('...')
                for i, line in enumerate(lines[-5:]):
                    print('  Line {}: {}'.format(len(lines)-5+i, repr(line[:100])))
        else:
            print('End marker not found')
            # Try alternative
            print('Context after val_start:', repr(content[val_start:val_start+200]))