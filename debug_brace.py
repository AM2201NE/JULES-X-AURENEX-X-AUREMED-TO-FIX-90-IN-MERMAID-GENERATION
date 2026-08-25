with open(r'c:\Users\GG\Desktop\New folder\AURENEX-AUREMED 2\lib\skills\medical-skills-data.json', 'rb') as f:
    content = f.read()

idx = content.find(b'biomarker-landscape-scanner')
print('Found at:', idx)

obj_start = content.rfind(b'{', 0, idx)
print('Object starts at:', obj_start)

next_obj = content.find(b'{"name": "literature-evidence-mapper"', idx)
print('Next object at:', next_obj)

closing_brace = content.rfind(b'}', idx, next_obj)
print('Closing brace at:', closing_brace)

print('Context around closing brace:', repr(content[closing_brace-20:closing_brace+20]))