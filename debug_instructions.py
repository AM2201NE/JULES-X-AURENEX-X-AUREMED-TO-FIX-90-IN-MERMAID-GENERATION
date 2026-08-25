with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

idx = content.find(b'biomarker-landscape-scanner')
inst_idx = content.find(b'instructions', idx)
print('instructions at:', inst_idx)

val_start = content.find(b'"', inst_idx + 13) + 1
print('value starts at:', val_start)

print('Value start context:', repr(content[val_start:val_start+200]))