with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find('biomarker-landscape-scanner')
if idx >= 0:
    inst_idx = content.find('instructions', idx)
    if inst_idx >= 0:
        val_start = content.find('"', inst_idx + 13) + 1
        print('val_start:', val_start)
        print('Context:', repr(content[val_start:val_start+200]))
        
        next_skill = content.find('"name": "literature-evidence-mapper"', val_start)
        if next_skill >= 0:
            print('next_skill at:', next_skill)
            between = content[val_start:next_skill]
            print('Length between:', len(between))
            print('Last 200 chars:', repr(between[-200:]))
            
            # Check for unescaped newlines
            for i, ch in enumerate(between):
                if ch == '\n':
                    print(f'Unescaped newline at position {i}: {repr(between[max(0,i-20):i+20])}')