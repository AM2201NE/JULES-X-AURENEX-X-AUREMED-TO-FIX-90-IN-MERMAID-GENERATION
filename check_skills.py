import json
data = json.load(open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data_fixed.json', 'r', encoding='utf-8'))
total = sum(len(cat['skills']) for cat in data['categories'].values())
print(f'Total skills in fixed JSON: {total}')
for cat_name, cat in data['categories'].items():
    print(f'  {cat_name}: {len(cat["skills"])} skills')
    for skill in cat['skills']:
        has_instructions = 'instructions' in skill
        has_outputSchema = 'outputSchema' in skill
        print(f'    - {skill["name"]}: instructions={has_instructions}, outputSchema={has_outputSchema}')