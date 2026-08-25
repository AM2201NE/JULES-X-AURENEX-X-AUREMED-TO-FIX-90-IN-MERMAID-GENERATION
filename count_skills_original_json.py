import json
data = json.load(open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'r', encoding='utf-8'))
total = sum(len(cat['skills']) for cat in data['categories'].values())
print(f'Total skills: {total}')
for cat_name, cat in data['categories'].items():
    print(f'  {cat_name}: {len(cat["skills"])} skills')