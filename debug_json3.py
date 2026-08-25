with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find('biomarker-landscape-scanner')
if idx >= 0:
    inst_idx = content.find('instructions', idx)
    if inst_idx >= 0:
        val_start = content.find('"', inst_idx + 13) + 1
        next_skill = content.find('"name": "literature-evidence-mapper"', val_start)
        between = content[val_start:next_skill]
        print('Full between:')
        print(repr(between))